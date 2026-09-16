import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { events } from "../events.js";
import type { StreamRequest, ToolActivity } from "@kotys/contracts";
import { MAX_TOOL_ROUNDS } from "./turnWrapUp.js";
import { streamChat, type StreamCallbacks } from "./streamChat.js";

const HOME = "/tmp/kotys-streamchat-loop-test-home";

type Part = {
  message?: {
    content?: string;
    thinking?: string;
    tool_calls?: {
      function: { name: string; arguments: Record<string, unknown> };
    }[];
  };
  done?: boolean;
  eval_count?: number;
};

const h = vi.hoisted(() => ({
  state: {
    scripts: [] as unknown[][],
    roundBodies: [] as { messages: unknown[]; tools?: unknown[] }[],
    abortedRounds: 0,
    runToolCalls: [] as { name: string; args: Record<string, unknown> }[],
    toolsEnabled: {} as Record<string, boolean>,
    promptTokens: [] as number[],
  },
  reset() {
    h.state.scripts.length = 0;
    h.state.roundBodies.length = 0;
    h.state.abortedRounds = 0;
    h.state.runToolCalls.length = 0;
    h.state.toolsEnabled = {};
    h.state.promptTokens = [];
  },
}));

vi.mock("ollama", () => ({
  Ollama: class {
    stop = { stopped: false };
    chat(body: { messages: unknown[]; tools?: unknown[] }) {
      h.state.roundBodies.push(body);
      const parts = (h.state.scripts.shift() ?? []) as {
        message?: Part["message"];
      }[];
      const stopFlag = this.stop;
      const promptTokens = (h.state.promptTokens ?? []).shift() ?? 0;
      return (async function* () {
        for (let j = 0; j < parts.length; j++) {
          if (stopFlag.stopped) return;
          // Only the closing part of a round carries usage (like the wire).
          yield j === parts.length - 1
            ? { ...parts[j], prompt_eval_count: promptTokens }
            : parts[j];
        }
      })();
    }
    abort() {
      this.stop.stopped = true;
      h.state.abortedRounds++;
    }
  },
}));
vi.mock("node:os", () => ({
  default: { homedir: () => HOME, hostname: () => "test-box" },
  homedir: () => HOME,
  hostname: () => "test-box",
}));
vi.mock("@kotys/db", () => ({
  getSetting: (key: string) =>
    key === "tools_enabled" && Object.keys(h.state.toolsEnabled).length > 0
      ? JSON.stringify(h.state.toolsEnabled)
      : null,
  getChatIdForMessage: () => 42,
  getChatById: () => null,
  getChatTopics: () => [],
  updateMessage: () => {},
  insertToolResults: () => {},
  getChatLoadedTools: () => [],
  rememberChatLoadedTools: () => {},
}));
// Real definitions keep tools advertised; runTool is scripted by its args.
vi.mock("../../tools/index.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/index.js")>();
  return {
    ...real,
    runTool: async (_name: string, args: Record<string, unknown>) => ({
      content: typeof args.bytes === "number" ? "x".repeat(args.bytes) : "ok",
      ...(args.withImage ? { resultImages: ["c2NyZWVu"] } : {}),
    }),
  };
});
vi.mock("../mcp.js", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    isMcpTool: () => false,
    getMcpServerForTool: () => undefined,
    getMcpToolDefinitionsByName: () => [],
    getToolRoster: () => ({ index: "", loadTool: null }),
    summarizeMcpArgs: () => undefined,
    loadMcpTools: () => {
      throw new Error("loadMcpTools must not be called in these tests");
    },
    callMcpTool: async () => ({ content: "mcp-content" }),
  };
});

const { state } = h;

beforeEach(() => {
  h.reset();
  events.removeAllListeners("approval:request");
  events.removeAllListeners("approval:cancel");
});

afterEach(() => {
  events.removeAllListeners("approval:request");
  events.removeAllListeners("approval:cancel");
});

const model = {
  name: "test-model",
  capabilities: ["thinking"],
  contextLength: 128_000,
  source: "local" as const,
};

const smallWindowModel = { ...model, contextLength: 32_768 };

const baseReq = (): StreamRequest => ({
  requestId: 900,
  host: "http://127.0.0.1:11434",
  model,
  messages: [
    { role: "system", content: "You are Kotys." },
    { role: "user", content: "go" },
  ],
});

const toolCallPart = (
  name: string,
  args: Record<string, unknown> = {},
): Part => ({
  message: {
    tool_calls: [{ function: { name, arguments: args } }],
  },
  done: true,
});

const doneText = (content: string): Part => ({
  message: { content },
  done: true,
  eval_count: 4,
});

const cbs = (): StreamCallbacks & { activity: ToolActivity[] } => {
  const activity: ToolActivity[] = [];
  return {
    activity,
    onChunk: () => undefined,
    onToolActivity: (a: ToolActivity) => activity.push(a),
  } as never;
};

describe("streamChat steering", () => {
  const sees = (round: { messages: unknown[] }, content: string) =>
    round.messages.some(
      (m) =>
        (m as { role: string }).role === "user" &&
        (m as { content: string }).content === content,
    );

  it("injects a steer at the next round boundary and traces it in place", async () => {
    state.scripts.push([toolCallPart("list", { path: "." })]);
    state.scripts.push([doneText("Followed the steer.")]);
    // Queued while round 0's tools run, so round 1 is the first to see it.
    const pendingAppends = vi
      .fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ content: "stop, do X instead", id: "k1" }])
      .mockReturnValue([]);
    const callbacks = { ...cbs(), pendingAppends };

    const result = await streamChat(
      baseReq(),
      callbacks,
      new AbortController().signal,
    );

    expect(sees(state.roundBodies[0], "stop, do X instead")).toBe(false);
    expect(sees(state.roundBodies[1], "stop, do X instead")).toBe(true);
    expect(result.toolCalls.map((t) => t.tool)).toEqual(["list", "steer"]);
    const steer = result.toolCalls[1];
    expect(steer).toMatchObject({
      status: "done",
      textOffset: 0,
      widget: { kind: "steer", text: "stop, do X instead", id: "k1" },
    });
    expect(callbacks.activity).toContainEqual(steer);
    expect(result.content).toBe("Followed the steer.");
  });

  it("gives a steer sent during a text-only answer a round of its own", async () => {
    state.scripts.push([doneText("First answer.")]);
    state.scripts.push([doneText("Answer to the steer.")]);
    // Arrives while round 0 streams its (tool-free) answer.
    const pendingAppends = vi
      .fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ content: "also cover Y", id: "k2" }])
      .mockReturnValue([]);

    const result = await streamChat(
      baseReq(),
      { ...cbs(), pendingAppends },
      new AbortController().signal,
    );

    expect(state.roundBodies).toHaveLength(2);
    const second = state.roundBodies[1].messages as {
      role: string;
      content: string;
    }[];
    expect(second.slice(-2)).toEqual([
      expect.objectContaining({ role: "assistant", content: "First answer." }),
      expect.objectContaining({ role: "user", content: "also cover Y" }),
    ]);
    expect(result.content).toBe("First answer.\n\nAnswer to the steer.");
    const steer = result.toolCalls.find((t) => t.widget?.kind === "steer");
    expect(steer?.textOffset).toBe("First answer.\n\n".length);
  });

  it("ends a text-only turn when nothing was steered", async () => {
    state.scripts.push([doneText("Just the answer.")]);
    const pendingAppends = vi.fn().mockReturnValue([]);

    const result = await streamChat(
      baseReq(),
      { ...cbs(), pendingAppends },
      new AbortController().signal,
    );

    expect(state.roundBodies).toHaveLength(1);
    expect(result.toolCalls).toEqual([]);
    // Before the round, and once more before letting the turn end.
    expect(pendingAppends).toHaveBeenCalledTimes(2);
  });

  it("hands a steer to the forced final answer when the budget stops the loop", async () => {
    state.scripts.push([
      { message: { content: "round 0" } },
      toolCallPart("list", { path: "." }),
    ]);
    state.scripts.push([doneText("Wrapped up with the steer.")]);
    // Round 0 fills the 32K window: the loop stops before the top-of-round drain.
    state.promptTokens = [26_000];
    const pendingAppends = vi
      .fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ content: "just summarize", id: "k3" }])
      .mockReturnValue([]);

    const result = await streamChat(
      { ...baseReq(), model: smallWindowModel },
      { ...cbs(), pendingAppends },
      new AbortController().signal,
    );

    const finalRound = state.roundBodies.at(-1)!;
    expect(finalRound.tools).toBeUndefined();
    expect(sees(finalRound, "just summarize")).toBe(true);
    expect(result.toolCalls.map((t) => t.tool)).toEqual(["list", "steer"]);
  });
});

describe("streamChat loop persistence", () => {
  it("runs many tool rounds by default and only stops when the model stops calling tools", async () => {
    const rounds = 30;
    for (let i = 0; i < rounds; i++) {
      state.scripts.push([
        { message: { content: `step ${i} done. Next: step ${i + 1}.` } },
        toolCallPart("list", { path: "." }),
      ]);
    }
    state.scripts.push([doneText("All steps complete.")]);

    const result = await streamChat(
      baseReq(),
      cbs(),
      new AbortController().signal,
    );

    expect(state.roundBodies).toHaveLength(rounds + 1);
    expect(result.content).toContain("All steps complete.");
    expect(result.toolCalls).toHaveLength(rounds);
  });

  it("at the round cap, the last tool round carries an assistant wrap-up prefill and the turn ends as a summary, not a cut-off", async () => {
    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
      state.scripts.push([toolCallPart("list")]);
    }
    state.scripts.push([doneText("Ran out of rounds; 5 steps remain.")]);

    const result = await streamChat(
      baseReq(),
      cbs(),
      new AbortController().signal,
    );

    expect(state.roundBodies).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(result.toolCalls).toHaveLength(MAX_TOOL_ROUNDS);
    expect(result.content).toContain("remain");

    const lastToolRound = state.roundBodies[MAX_TOOL_ROUNDS - 1];
    const lastMsg = lastToolRound.messages.at(-1) as {
      role: string;
      content: string;
    };
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.content).toContain("final tool round");

    const finalRound = state.roundBodies[MAX_TOOL_ROUNDS];
    expect(finalRound.tools).toBeUndefined();
    const texts = finalRound.messages
      .map((m) => (m as { content: string }).content)
      .join("\n");
    expect(texts).toContain("MAXIMUM TOOL BUDGET REACHED");
    expect(texts).toContain("what remains");
  });

  it("stops on the byte budget with the same wrap-up, not a silent cut-off", async () => {
    // 4 × 52 KB crosses 200 KB; distinct paths dodge the read_file dedupe.
    for (let i = 0; i < 4; i++) {
      state.scripts.push([
        toolCallPart("read_file", { path: `f${i}.txt`, bytes: 52_000 }),
      ]);
    }
    state.scripts.push([doneText("Budget hit; verification steps remain.")]);

    const result = await streamChat(
      baseReq(),
      cbs(),
      new AbortController().signal,
    );

    expect(result.toolCalls).toHaveLength(4);
    expect(result.toolCalls[4]).toBeUndefined();
    expect(result.content).toContain("remain");
    const finalRound = state.roundBodies.at(-1) as { tools?: unknown[] };
    expect(finalRound.tools).toBeUndefined();
  });

  it("drops tool images from the wire once seen — later rounds re-send only the text result", async () => {
    state.scripts.push([toolCallPart("list", { withImage: true })]);
    state.scripts.push([toolCallPart("list", { withImage: false })]);
    state.scripts.push([doneText("done")]);

    await streamChat(baseReq(), cbs(), new AbortController().signal);

    const toolMsg = (body: { messages: unknown[] }) =>
      body.messages.filter((m) => (m as { role: string }).role === "tool");
    expect(toolMsg(state.roundBodies[1])[0]).toMatchObject({
      images: ["c2NyZWVu"],
    });
    expect(toolMsg(state.roundBodies[2])[0]).not.toHaveProperty("images");
  });

  it("stops on the token observer before the server's context window rejects the round", async () => {
    for (let i = 0; i < 6; i++) {
      state.scripts.push([
        { message: { content: `round ${i}` } },
        toolCallPart("list", { path: `d${i}` }),
      ]);
    }
    state.scripts.push([
      doneText("Wrapped before the window; 2 steps remain."),
    ]);
    // Round 2 reports 26k, and 26k + 8k headroom reaches the 32,768 window.
    state.promptTokens = [10_000, 18_000, 26_000, 30_000, 30_000, 30_000];

    const result = await streamChat(
      { ...baseReq(), model: smallWindowModel },
      cbs(),
      new AbortController().signal,
    );

    expect(result.toolCalls).toHaveLength(3);
    const finalRound = state.roundBodies.at(-1) as {
      tools?: unknown[];
      messages: { content: string }[];
    };
    expect(finalRound.tools).toBeUndefined();
    const wrapUpTexts = finalRound.messages
      .map((m) => (m as { content: string }).content)
      .join("\n");
    expect(wrapUpTexts).toContain("context window");
    expect(wrapUpTexts).toContain("what remains");
  });
});
