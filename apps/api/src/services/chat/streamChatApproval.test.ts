import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { events } from "../events.js";
import { resolveApproval } from "../approval.js";
import type { StreamRequest, ToolActivity } from "@kotys/contracts";
import { streamChat, type StreamCallbacks } from "./streamChat.js";

const HOME = "/tmp/kotys-streamchat-test-home";

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
    roundBodies: [] as { messages: unknown[] }[],
    abortedRounds: 0,
    clients: [] as Array<{ host: string; headers: Record<string, string> }>,
    toolsEnabled: {} as Record<string, boolean>,
  },
  reset() {
    h.state.scripts.length = 0;
    h.state.roundBodies.length = 0;
    h.state.abortedRounds = 0;
    h.state.clients.length = 0;
    h.state.toolsEnabled = {};
  },
}));

vi.mock("ollama", () => ({
  Ollama: class {
    host: string;
    headers: Record<string, string>;
    stop = { stopped: false };
    constructor(args: { host: string; headers: Record<string, string> }) {
      this.host = args.host;
      this.headers = args.headers;
    }
    chat(body: { messages: unknown[] }) {
      h.state.roundBodies.push(body);
      h.state.clients.push({ host: this.host, headers: this.headers });
      const parts = (h.state.scripts.shift() ?? []) as {
        message?: Part["message"];
      }[];
      const stopFlag = this.stop;
      return (async function* () {
        for (const p of parts) {
          if (stopFlag.stopped) return;
          yield p;
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
vi.mock("../mcp.js", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    isMcpTool: () => false,
    getMcpServerForTool: () => undefined,
    getMcpToolDefinitionsByName: () => [],
    summarizeMcpArgs: () => undefined,
    loadMcpTools: () => {
      throw new Error("loadMcpTools must not be called in these tests");
    },
    callMcpTool: async () => ({ content: "mcp-content" }),
  };
});

const { state } = h;

const model = {
  name: "test-model",
  capabilities: ["thinking"],
  contextLength: 128_000,
  source: "local" as const,
};

const baseReq = (): StreamRequest => ({
  requestId: 900,
  host: "http://127.0.0.1:11434",
  model,
  messages: [
    { role: "system", content: "You are Kotys." },
    { role: "user", content: "go" },
  ],
});

const toolCallPart = (name: string, args: Record<string, unknown>): Part => ({
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

beforeEach(() => {
  h.reset();
  events.removeAllListeners("approval:request");
  events.removeAllListeners("approval:cancel");
});

afterEach(() => {
  events.removeAllListeners("approval:request");
  events.removeAllListeners("approval:cancel");
});

describe("streamChat approval flow", () => {
  it("a declined approval prevents tool execution and the loop moves on", async () => {
    events.onEvent("approval:request", ({ id }) => resolveApproval(id, false));
    state.scripts.push(
      [
        toolCallPart("write_file", {
          path: "denied.txt",
          content: "should never land",
        }),
      ],
      [doneText("I could not write the file.")],
    );
    const recorded = cbs();
    const result = await streamChat(
      baseReq(),
      recorded,
      new AbortController().signal,
    );

    expect(result.content).toContain("could not write");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].status).toBe("error");
    await expect(fs.access(path.join(HOME, "denied.txt"))).rejects.toThrow();
    expect(state.roundBodies).toHaveLength(2);
  });

  it("aborts retract a pending approval: dialog cancelled, tool not run, turn ends like a stop", async () => {
    state.scripts.push(
      [
        { message: { content: "Working on it." } },
        toolCallPart("write_file", { path: "attack.txt", content: "pwned" }),
      ],
      [doneText("never")],
    );
    const cancels: number[] = [];
    const requests: number[] = [];
    events.onEvent("approval:request", ({ id }) => requests.push(id));
    events.onEvent("approval:cancel", ({ id }) => cancels.push(id));

    const controller = new AbortController();
    const recorded = cbs();
    const pending = streamChat(baseReq(), recorded, controller.signal);

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    controller.abort();

    const result = await pending;
    expect(cancels).toEqual(requests);
    expect(result.content).toContain("Working on it.");
    expect(result.toolCalls[0].status).toBe("error");
    await expect(fs.access(path.join(HOME, "attack.txt"))).rejects.toThrow();
    expect(state.abortedRounds).toBeGreaterThan(0);
    expect(state.roundBodies).toHaveLength(1);
  });

  it("an approved write_file runs to completion", async () => {
    events.onEvent("approval:request", ({ id }) => resolveApproval(id, true));
    state.scripts.push(
      [toolCallPart("write_file", { path: "ok.txt", content: "hello" })],
      [doneText("done")],
    );
    const recorded = cbs();
    const result = await streamChat(
      baseReq(),
      recorded,
      new AbortController().signal,
    );
    expect(result.toolCalls[0].status).toBe("done");
    const written = await fs.readFile(path.join(HOME, "ok.txt"), "utf8");
    expect(written).toContain("hello");
  });
});

describe("streamChat widget interleaving", () => {
  beforeEach(() => {
    h.reset();
    events.removeAllListeners("approval:request");
    events.removeAllListeners("approval:cancel");
  });

  it("records where in the streamed text a widget-bearing call happened", async () => {
    events.onEvent("approval:request", ({ id }) => resolveApproval(id, true));
    state.scripts.push(
      [
        { message: { content: "Yes I will test it.\n\n" } },
        toolCallPart("read_file", { path: "note.txt" }),
      ],
      [doneText("Here is the review.")],
    );
    const recorded = cbs();
    const result = await streamChat(
      baseReq(),
      recorded,
      new AbortController().signal,
    );

    const call = result.toolCalls[0];
    expect(call.textOffset).toBe("Yes I will test it.\n\n".length);
    expect(result.content.slice(call.textOffset ?? 0).trim()).toBe(
      "Here is the review.",
    );
  });
});

describe("streamChat permission modes", () => {
  beforeEach(() => {
    h.reset();
    events.removeAllListeners("approval:request");
    events.removeAllListeners("approval:cancel");
  });

  afterEach(() => {
    events.removeAllListeners("approval:request");
    events.removeAllListeners("approval:cancel");
  });

  it("ask mode prompts before a read tool and runs it once approved", async () => {
    await fs.mkdir(HOME, { recursive: true });
    await fs.writeFile(path.join(HOME, "notes.txt"), "hello");
    const requests: { tool: string; preview?: string }[] = [];
    events.onEvent("approval:request", (req) => {
      requests.push({ tool: req.tool, preview: req.preview });
      resolveApproval(req.id, true);
    });
    state.scripts.push(
      [toolCallPart("read_file", { path: "notes.txt" })],
      [doneText("read it")],
    );
    const recorded = cbs();
    const result = await streamChat(
      { ...baseReq(), mode: "ask" },
      recorded,
      new AbortController().signal,
    );
    expect(requests.map((r) => r.tool)).toEqual(["read_file"]);
    expect(requests[0].preview).toBe("notes.txt");
    expect(result.toolCalls[0].status).toBe("done");
  });

  it("ask mode leaves a declined read unexecuted and the loop moving", async () => {
    events.onEvent("approval:request", ({ id }) => resolveApproval(id, false));
    state.scripts.push(
      [toolCallPart("read_file", { path: "secret.txt" })],
      [doneText("understood, skipping")],
    );
    const recorded = cbs();
    const result = await streamChat(
      { ...baseReq(), mode: "ask" },
      recorded,
      new AbortController().signal,
    );
    expect(result.toolCalls[0].status).toBe("error");
    expect(result.toolCalls[0].error).toBe("declined");
    expect(state.roundBodies).toHaveLength(2);
  });

  it("ask mode does not double-prompt writing tools that gate themselves", async () => {
    events.onEvent("approval:request", ({ id }) => resolveApproval(id, true));
    state.scripts.push(
      [toolCallPart("write_file", { path: "x.txt", content: "hi" })],
      [doneText("done")],
    );
    const recorded = cbs();
    const result = await streamChat(
      { ...baseReq(), mode: "ask" },
      recorded,
      new AbortController().signal,
    );
    expect(result.toolCalls[0].status).toBe("done");
    await expect(
      fs.readFile(path.join(HOME, "x.txt"), "utf8"),
    ).resolves.toContain("hi");
  });

  it("copilot mode (default) runs reads without any prompt", async () => {
    await fs.mkdir(HOME, { recursive: true });
    const prompts = vi.fn();
    events.onEvent("approval:request", ({ id }) => {
      prompts();
      resolveApproval(id, true);
    });
    state.scripts.push(
      [toolCallPart("list", { path: "." })],
      [doneText("done")],
    );
    const recorded = cbs();
    const result = await streamChat(
      baseReq(),
      recorded,
      new AbortController().signal,
    );
    expect(result.toolCalls.map((t) => t.status)).toEqual(["done"]);
    expect(prompts).not.toHaveBeenCalled();
  });

  it("autopilot mode runs writes without any prompt", async () => {
    const prompts = vi.fn();
    events.onEvent("approval:request", ({ id }) => {
      prompts();
      resolveApproval(id, true);
    });
    state.scripts.push(
      [toolCallPart("write_file", { path: "auto.txt", content: "go" })],
      [doneText("done")],
    );
    const recorded = cbs();
    const result = await streamChat(
      { ...baseReq(), mode: "autopilot" },
      recorded,
      new AbortController().signal,
    );
    expect(prompts).not.toHaveBeenCalled();
    expect(result.toolCalls[0].status).toBe("done");
    const written = await fs.readFile(path.join(HOME, "auto.txt"), "utf8");
    expect(written).toContain("go");
  });

  it("ask mode prompts before a read-only shell command", async () => {
    await fs.mkdir(HOME, { recursive: true });
    const requests: string[] = [];
    events.onEvent("approval:request", (req) => {
      requests.push(req.command ?? req.tool);
      resolveApproval(req.id, false);
    });
    state.scripts.push(
      [toolCallPart("bash", { command: "ls" })],
      [doneText("skipped")],
    );
    const result = await streamChat(
      { ...baseReq(), mode: "ask" },
      cbs(),
      new AbortController().signal,
    );
    expect(requests).toEqual(["ls"]);
    expect(result.toolCalls[0].status).toBe("error");
  });

  it("copilot mode runs a read-only shell command without a prompt", async () => {
    await fs.mkdir(HOME, { recursive: true });
    const prompts = vi.fn();
    events.onEvent("approval:request", ({ id }) => {
      prompts();
      resolveApproval(id, false);
    });
    state.scripts.push(
      [toolCallPart("bash", { command: "ls" })],
      [doneText("done")],
    );
    const result = await streamChat(
      baseReq(),
      cbs(),
      new AbortController().signal,
    );
    expect(prompts).not.toHaveBeenCalled();
    expect(result.toolCalls[0].status).toBe("done");
  });

  it("ask mode prompts before MCP-loading", async () => {
    const requests: string[] = [];
    events.onEvent("approval:request", (req) => {
      requests.push(req.tool);
      resolveApproval(req.id, true);
    });
    state.scripts.push([toolCallPart("load_tools", {})], [doneText("loaded")]);
    await streamChat(
      { ...baseReq(), mode: "ask" },
      cbs(),
      new AbortController().signal,
    );
    expect(requests).toEqual(["load_tools"]);
  });
});

describe("streamChat request shaping", () => {
  beforeEach(() => {
    h.reset();
    events.removeAllListeners("approval:request");
    events.removeAllListeners("approval:cancel");
  });

  afterEach(() => {
    events.removeAllListeners("approval:request");
    events.removeAllListeners("approval:cancel");
  });

  it("never offers a tool that settings disabled", async () => {
    state.toolsEnabled = { bash: false, write_file: false };
    state.scripts.push([doneText("Plain text answer.")]);
    await streamChat(baseReq(), cbs(), new AbortController().signal);
    expect(state.roundBodies.length).toBe(1);
    const body = state.roundBodies[0] as {
      tools?: [{ function: { name: string } }];
      messages: { role: string; content: string }[];
    };
    const names = (body.tools ?? []).map((d) => d.function.name);
    expect(names).not.toContain("bash");
    expect(names).not.toContain("write_file");
    expect(names).toContain("list");
    const system = body.messages.find((m) => m.role === "system");
    // apply_patch is lazy: the prompt advertises its signature instead.
    expect(system?.content).toContain("apply_patch(");
    expect(system?.content).not.toContain("bash(");
  });

  it("refuses a disabled tool the model calls anyway", async () => {
    await fs.mkdir(HOME, { recursive: true });
    await fs.rm(path.join(HOME, "off.txt"), { force: true });
    state.toolsEnabled = { write_file: false };
    const prompts = vi.fn();
    events.onEvent("approval:request", ({ id }) => {
      prompts();
      resolveApproval(id, true);
    });
    state.scripts.push(
      [toolCallPart("write_file", { path: "off.txt", content: "no" })],
      [doneText("ok")],
    );
    const result = await streamChat(
      { ...baseReq(), mode: "autopilot" },
      cbs(),
      new AbortController().signal,
    );
    expect(result.toolCalls[0].status).toBe("error");
    expect(result.toolCalls[0].error).toBe("disabled");
    expect(prompts).not.toHaveBeenCalled();
    await expect(fs.access(path.join(HOME, "off.txt"))).rejects.toThrow();
  });

  it("omits the tools field entirely when every tool is disabled", async () => {
    const { TOOL_DEFINITIONS } = await import("../../tools/index.js");
    const allDisabled: Record<string, boolean> = {};
    for (const d of TOOL_DEFINITIONS) allDisabled[d.function.name] = false;
    // spawn_agent is not in TOOL_DEFINITIONS (executor branch, like load_skill).
    allDisabled["spawn_agent"] = false;
    state.toolsEnabled = allDisabled;
    state.scripts.push([doneText("Only prose.")]);
    await streamChat(baseReq(), cbs(), new AbortController().signal);
    expect(state.roundBodies[0] && "tools" in state.roundBodies[0]).toBe(false);
  });

  it("separates text before and after tool use with an empty-line chunk", async () => {
    state.scripts.push(
      [{ message: { content: "before tools" } }, toolCallPart("list", {})],
      [doneText("after tools")],
    );
    const chunks: Array<{ thinkingDelta: string; contentDelta: string }> = [];
    await streamChat(
      baseReq(),
      {
        onChunk: (c: { thinkingDelta: string; contentDelta: string }) =>
          chunks.push(c),
        onToolActivity: () => undefined,
      } as never,
      new AbortController().signal,
    );
    const contents = chunks.map((c) => c.contentDelta);
    expect(contents.join("")).toContain("before tools");
    const sepIndex = chunks.findIndex((c) => c.contentDelta === "\n\n");
    expect(sepIndex).toBeGreaterThan(-1);
    const after = chunks.findIndex((c) =>
      c.contentDelta.includes("after tools"),
    );
    expect(after).toBeGreaterThan(sepIndex);
  });

  it("does not notify for a reply the user watched stream in (fast turn)", async () => {
    state.scripts.push([doneText("quick answer")]);
    const notifies: unknown[] = [];
    events.onEvent("notify", (n) => void notifies.push(n));
    const result = await streamChat(
      baseReq(),
      cbs(),
      new AbortController().signal,
    );
    expect(result.content).toBe("quick answer");
    expect(notifies).toHaveLength(0);
  });

  it("falls back to a char-based prompt estimate when the server reports no counts", async () => {
    state.scripts.push([{ message: { content: "hey" }, done: true }]);
    const result = await streamChat(
      baseReq(),
      cbs(),
      new AbortController().signal,
    );
    expect(result.promptTokens).toBeGreaterThan(0);
    expect(result.evalTokens).toBeGreaterThanOrEqual(0);
  });
});

describe("streamChat stop", () => {
  // An aborted request fails the pending read with the signal's reason, as
  // undici does.
  const sse =
    (deltas: object[], end: "done" | "open" | Error) =>
    (signal: AbortSignal | null | undefined) => {
      const frames = deltas.map(
        (delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`,
      );
      if (end === "done") frames.push("data: [DONE]\n\n");
      return new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener(
            "abort",
            () => controller.error(signal.reason),
            { once: true },
          );
        },
        pull(controller) {
          const frame = frames.shift();
          if (frame) controller.enqueue(new TextEncoder().encode(frame));
          else if (end === "done") controller.close();
          else if (end instanceof Error) controller.error(end);
        },
      });
    };

  const stubOmlx = (replies: ReturnType<typeof sse>[]) => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const reply = replies.shift();
      if (!reply) throw new Error("unexpected request");
      return new Response(reply(init?.signal), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  const omlxReq = (): StreamRequest => ({ ...baseReq(), provider: "omlx" });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a stop mid-reply ends the turn with what streamed, not an error", async () => {
    await fs.mkdir(HOME, { recursive: true });
    const fetchMock = stubOmlx([
      sse(
        [
          { content: "Checking." },
          {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "list", arguments: '{"path":"."}' },
              },
            ],
          },
        ],
        "done",
      ),
      sse([{ content: "Partial ans" }], "open"),
    ]);
    const streamed: string[] = [];
    const controller = new AbortController();
    const pending = streamChat(
      omlxReq(),
      {
        onChunk: (c) => streamed.push(c.contentDelta),
        onToolActivity: () => undefined,
      },
      controller.signal,
    );

    await vi.waitFor(() => expect(streamed.join("")).toContain("Partial ans"));
    controller.abort();

    const result = await pending;
    expect(result.content).toBe("Checking.\n\nPartial ans");
    expect(result.toolCalls.map((t) => [t.tool, t.status])).toEqual([
      ["list", "done"],
    ]);
    // No retry and no forced wrap-up round after a stop.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a provider failure mid-reply still fails the turn", async () => {
    stubOmlx([sse([{ content: "Partial ans" }], new TypeError("terminated"))]);
    await expect(
      streamChat(omlxReq(), cbs(), new AbortController().signal),
    ).rejects.toThrow("terminated");
  });
});
