import { describe, expect, it } from "vitest";
import { createTurnStreamer, type TurnStreamerArgs } from "./turnStream.js";
import type { ConnectorStreamChunk, StreamHandle } from "../llm/types.js";

/**
 * A scripted connector: each `stream` call consumes the next script. A script
 * is a chunk list, or an Error to reject the round with (its message is what
 * the fallback matcher sees).
 */
function scriptedConnector(scripts: (ConnectorStreamChunk[] | Error)[]) {
  let i = 0;
  return {
    stream: (
      _req: unknown,
      onChunk: (c: ConnectorStreamChunk) => void,
      _signal: AbortSignal,
    ): StreamHandle => {
      const script = scripts[i++];
      return {
        done: (async () => {
          if (script instanceof Error) throw script;
          for (const c of script) onChunk(c);
          return { promptTokens: 1, evalTokens: 2 };
        })(),
      };
    },
  };
}

const args = (
  scripts: (ConnectorStreamChunk[] | Error)[],
  overrides?: Partial<TurnStreamerArgs>,
): TurnStreamerArgs => ({
  connector: scriptedConnector(scripts) as never,
  modelName: "m",
  chatMessages: [],
  tools: [
    {
      type: "function",
      function: { name: "t", description: "", parameters: {} },
    },
  ],
  initialThink: true,
  signal: new AbortController().signal,
  onDelta: () => undefined,
  ...overrides,
});

const textRound = (content: string): ConnectorStreamChunk[] => [
  { thinkingDelta: "", contentDelta: content },
];

const callRound = (name: string): ConnectorStreamChunk[] => [
  {
    thinkingDelta: "",
    contentDelta: "",
    toolCalls: [{ id: "1", function: { name, arguments: {} } }],
  },
];

describe("createTurnStreamer", () => {
  it("accumulates content, thinking, and lastRoundContent across rounds", async () => {
    const s = createTurnStreamer(
      args([
        [{ thinkingDelta: "t1", contentDelta: "a" }],
        callRound("list"),
        textRound("final"),
      ]),
    );
    expect(await s.round()).toHaveLength(0);
    expect(s.lastRoundContent).toBe("a");
    expect(await s.round()).toHaveLength(1);
    expect(s.lastRoundContent).toBe("");
    expect(await s.roundWithoutTools()).toHaveLength(0);
    expect(s.content).toBe("afinal");
    expect(s.thinking).toBe("t1");
  });

  it("retries without think when the model rejects it, but only before anything streamed", async () => {
    const s = createTurnStreamer(
      args([new Error("model does not support think"), textRound("ok")]),
    );
    expect(await s.round()).toHaveLength(0);
    expect(s.content).toBe("ok");
  });

  it("drops tools after a tools-rejection and reports toolsActive false", async () => {
    const s = createTurnStreamer(
      args([new Error("tools not supported"), textRound("plain")]),
    );
    expect(await s.round()).toHaveLength(0);
    expect(s.toolsActive).toBe(false);
  });

  it("rethrows once content has streamed — no mid-turn retry", async () => {
    const s = createTurnStreamer(
      args([textRound("partial"), new Error("model does not support think")]),
    );
    await s.round();
    await expect(s.round()).rejects.toThrow("think");
  });

  it("separator only emits between prose", async () => {
    const deltas: string[] = [];
    const s = createTurnStreamer(
      args([textRound("hi")], { onDelta: (_t, c) => deltas.push(c ?? "") }),
    );
    await s.round();
    s.separator();
    expect(deltas).toEqual(["hi", "\n\n"]);
    // The break is also accumulated: persisted writes store `content`, so a
    // separator-less row would collapse round boundaries after a reload.
    expect(s.content).toBe("hi\n\n");
    // Empty content: no separator.
    deltas.length = 0;
    const empty = createTurnStreamer(
      args([[{ thinkingDelta: "", contentDelta: "" }]], {
        onDelta: (_t, c) => deltas.push(c ?? ""),
      }),
    );
    await empty.round();
    empty.separator();
    expect(deltas).toEqual([]);
    expect(empty.content).toBe("");
  });

  it("separator keeps persisted content aligned with the streamed one across rounds", async () => {
    const deltas: string[] = [];
    const s = createTurnStreamer(
      args(
        [
          [
            { thinkingDelta: "", contentDelta: "before" },
            {
              thinkingDelta: "",
              contentDelta: "",
              toolCalls: [
                { id: "1", function: { name: "list", arguments: {} } },
              ],
            },
          ],
          textRound("after"),
        ],
        { onDelta: (_t, c) => deltas.push(c ?? "") },
      ),
    );
    // One tool round, one separator — the streamChat loop's exact cadence.
    expect(await s.round()).toHaveLength(1);
    s.separator();
    expect(await s.roundWithoutTools()).toHaveLength(0);
    // Streamed == accumulated: what the viewer saw is what gets persisted.
    expect(deltas.join("")).toBe("before\n\nafter");
    expect(s.content).toBe("before\n\nafter");
  });

  it("reports the turn's peak prompt after every round, for the live meter", async () => {
    const prompts = [4_554, 26_944, 8_358];
    let round = 0;
    const connector = {
      stream: (
        _req: unknown,
        onChunk: (c: ConnectorStreamChunk) => void,
      ): StreamHandle => ({
        done: (async () => {
          onChunk({ thinkingDelta: "", contentDelta: "x" });
          return { promptTokens: prompts[round++], evalTokens: 10 };
        })(),
      }),
    };
    const reported: number[] = [];
    const s = createTurnStreamer(
      args([], {
        connector: connector as never,
        onUsage: (promptTokens) => reported.push(promptTokens),
      }),
    );

    await s.round();
    await s.round();
    await s.round();

    expect(reported).toEqual([4_554, 26_944, 26_944]);
  });
});
