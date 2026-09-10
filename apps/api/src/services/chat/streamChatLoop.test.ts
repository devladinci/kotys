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
// Real definitions (so tools are advertised) with a scripted dispatcher, so
// loop tests can control result sizes without touching the filesystem.
vi.mock("../../tools/index.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/index.js")>();
  return {
    ...real,
    runTool: async (_name: string, args: Record<string, unknown>) => ({
      content: typeof args.bytes === "number" ? "x".repeat(args.bytes) : "ok",
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

    // 30 tool rounds + the final text round; no budget-forced wrap-up after it.
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

    // 100 tool rounds + 1 forced final-answer round.
    expect(state.roundBodies).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(result.toolCalls).toHaveLength(MAX_TOOL_ROUNDS);
    expect(result.content).toContain("remain");

    // The last tool round's messages end with the assistant wrap-up prefill.
    const lastToolRound = state.roundBodies[MAX_TOOL_ROUNDS - 1];
    const lastMsg = lastToolRound.messages.at(-1) as {
      role: string;
      content: string;
    };
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.content).toContain("final tool round");

    // The forced wrap-up round offers no tools and carries the max-steps
    // instruction, so the turn ends as a summary with remaining work.
    const finalRound = state.roundBodies[MAX_TOOL_ROUNDS];
    expect(finalRound.tools).toBeUndefined();
    const texts = finalRound.messages
      .map((m) => (m as { content: string }).content)
      .join("\n");
    expect(texts).toContain("MAXIMUM TOOL BUDGET REACHED");
    expect(texts).toContain("what remains");
  });

  it("stops on the byte budget with the same wrap-up, not a silent cut-off", async () => {
    // ~52 KB per round: after 4 rounds toolResultBytes crosses 200 KB, so the
    // loop breaks before a 5th round. Distinct paths avoid the read_file
    // dedupe stubbing the repeats.
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

    // 4 rounds fit under 200 KB; the 5th call never runs.
    expect(result.toolCalls).toHaveLength(4);
    expect(result.toolCalls[4]).toBeUndefined();
    expect(result.content).toContain("remain");
    const finalRound = state.roundBodies.at(-1) as { tools?: unknown[] };
    expect(finalRound.tools).toBeUndefined();
  });

  it("stops on the token observer before the server's context window rejects the round", async () => {
    // A 32K window (oMLX's Qwen3.8): rounds report a growing server prompt;
    // once it reaches 32_768 - 8_000 the loop must stop instead of walking
    // into oMLX's "Prompt too long" 400.
    for (let i = 0; i < 6; i++) {
      state.scripts.push([
        { message: { content: `round ${i}` } },
        toolCallPart("list", { path: `d${i}` }),
      ]);
    }
    state.scripts.push([
      doneText("Wrapped before the window; 2 steps remain."),
    ]);
    // Prompt sizes per completed round: 0, 10k, 18k, 26k (crosses), ...
    state.promptTokens = [10_000, 18_000, 26_000, 30_000, 30_000, 30_000];

    const result = await streamChat(
      { ...baseReq(), model: smallWindowModel },
      cbs(),
      new AbortController().signal,
    );

    // Round 3's done reports 26_000 prompt tokens; 26_000 + 8_000 >= 32_768
    // stops the loop before round 4, which would have carried ~30k tokens.
    expect(result.toolCalls).toHaveLength(3);
    // The forced wrap-up round (tools dropped) still runs and produces prose.
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
