import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { events } from "../events.js";
import type { StreamRequest } from "@kotys/contracts";
import { streamChat } from "./streamChat.js";
import { clearTokenAccountingLog } from "./context-budget.js";

const HOME = "/tmp/kotys-context-test-home";

const h = vi.hoisted(() => ({
  state: {
    scripts: [] as unknown[][],
    roundBodies: [] as { messages: unknown[] }[],
    chat: null as Record<string, unknown> | null,
    turns: [] as {
      id: number;
      role: string;
      content: string;
      images: string | null;
      tool_calls: string | null;
      prompt_tokens?: number | null;
    }[],
    memories: [] as {
      id: number;
      type: string;
      content: string;
      topics: string[];
    }[],
    toolResults: [] as {
      message_id: number;
      call_index: number;
      content: string;
    }[],
    compactCalls: [] as number[],
    /** Boundary the stubbed compaction moves to; null = it fails. */
    compactTo: null as number | null,
  },
  reset() {
    h.state.scripts.length = 0;
    h.state.roundBodies.length = 0;
    h.state.chat = null;
    h.state.turns.length = 0;
    h.state.memories.length = 0;
    h.state.toolResults.length = 0;
    h.state.compactCalls.length = 0;
    h.state.compactTo = null;
  },
}));

vi.mock("ollama", () => ({
  Ollama: class {
    stop = { stopped: false };
    chat(body: { messages: unknown[] }) {
      h.state.roundBodies.push(body);
      const parts = (h.state.scripts.shift() ?? []) as {
        message?: { content?: string };
      }[];
      return (async function* () {
        for (const p of parts) yield p;
      })();
    }
    abort() {
      this.stop.stopped = true;
    }
  },
}));
vi.mock("node:os", () => ({
  default: { homedir: () => HOME, hostname: () => "test-box" },
  homedir: () => HOME,
  hostname: () => "test-box",
}));
vi.mock("@kotys/db", () => ({
  getSetting: () => null,
  getChatIdForMessage: (id: number) => (id === 900 ? 7 : null),
  getChatTopics: () => [],
  updateMessage: () => {},
  getChatById: (id: number) =>
    id === 7
      ? (h.state.chat ?? { id: 7, summary: null, summary_upto: null })
      : null,
  getMemoriesForChat: () => h.state.memories,
  getTurnRowsForChat: (_chatId: number, afterId: number, beforeId: number) =>
    h.state.turns.filter((t) => t.id > afterId && t.id < beforeId),
  getMeasuredPrompt: (_chatId: number, afterId: number) => {
    const anchor = [...h.state.turns]
      .sort((a, b) => b.id - a.id)
      .find(
        (t) =>
          t.role === "assistant" &&
          t.id > afterId &&
          (t.prompt_tokens ?? 0) > 0,
      );
    return anchor ? { id: anchor.id, tokens: anchor.prompt_tokens ?? 0 } : null;
  },
  deleteTurnsAfter: () => {},
  getToolResultsForMessages: () => h.state.toolResults ?? [],
  getChatLoadedTools: () => [],
  imagesOf: (row: { images: string | null }) =>
    row.images ? JSON.parse(row.images) : undefined,
  setChatSummary: () => {},
  setChatSummaryUpto: () => {},
}));
vi.mock("./compact.js", () => ({
  compactChat: (chatId: number) => {
    h.state.compactCalls.push(chatId);
    if (h.state.chat && h.state.compactTo !== null) {
      h.state.chat.summary = "SUMMARY-OF-EARLIER";
      h.state.chat.summary_upto = h.state.compactTo;
    }
    return Promise.resolve(null);
  },
}));
vi.mock("../skills/registry.js", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    getSkillAdvertisement: () => ({ index: "SKILLS-INDEX", loadTool: null }),
  };
});
vi.mock("../mcp.js", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    isMcpTool: () => false,
    getMcpServerForTool: () => undefined,
    getMcpToolDefinitionsByName: () => [],
    getToolRoster: () => ({ index: "TOOL-ROSTER-INDEX", loadTool: null }),
    getSkillAdvertisement: () => ({ index: "SKILLS-INDEX", loadTool: null }),
    loadMcpTools: () => {},
  };
});

const { state } = h;

beforeEach(() => {
  h.reset();
  clearTokenAccountingLog();
  events.removeAllListeners("approval:request");
  events.removeAllListeners("approval:cancel");
});

afterEach(() => {
  events.removeAllListeners("approval:request");
  events.removeAllListeners("approval:cancel");
});

const model = {
  name: "test-model",
  capabilities: [],
  contextLength: 128_000,
  source: "local" as const,
};

const collect = async (req: StreamRequest) => {
  const chunks: string[] = [];
  await streamChat(
    req,
    {
      onChunk: (c) => chunks.push(c.contentDelta),
      onToolActivity: () => {},
    },
    new AbortController().signal,
  );
  return chunks;
};

const scriptReply = (text: string) => {
  state.scripts.push([{ message: { content: text } }, { done: true }]);
};

describe("daemon context assembly", () => {
  it("keyed request: system message is rebuilt server-side with the block order", async () => {
    state.chat = {
      id: 7,
      summary: "Earlier: we discussed taxes.",
      summary_upto: 10,
    };
    state.turns = [
      {
        id: 11,
        role: "user",
        content: "second question",
        images: null,
        tool_calls: null,
      },
      {
        id: 12,
        role: "assistant",
        content: "second answer",
        images: null,
        tool_calls: null,
      },
    ];
    state.memories = [
      { id: 3, type: "user", content: "Name is Vlado", topics: ["identity"] },
    ];
    scriptReply("done");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model,
      chatId: 7,
      messages: [{ role: "user", content: "second question" }],
    });

    const sent = state.roundBodies[0].messages as {
      role: string;
      content: string;
    }[];
    const system = sent[0].content;
    expect(sent[0].role).toBe("system");
    expect(system).toContain("You are an agent");
    expect(system).toContain("Earlier: we discussed taxes.");
    // Stable → volatile: BASE, roster, skills, memory, summary, date last.
    const at = (needle: string) => system.indexOf(needle);
    expect(at("TOOL-ROSTER-INDEX")).toBeGreaterThan(at("You are an agent"));
    expect(at("SKILLS-INDEX")).toBeGreaterThan(at("TOOL-ROSTER-INDEX"));
    expect(at("[3] (user) Name is Vlado")).toBeGreaterThan(at("SKILLS-INDEX"));
    expect(at("Earlier: we discussed taxes")).toBeGreaterThan(
      at("[3] (user) Name is Vlado"),
    );
    expect(at("Current date and time")).toBeGreaterThan(
      at("Earlier: we discussed taxes"),
    );
    // Client turns replaced by the DB replay.
    expect(sent.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
    expect(sent[1].content).toBe("second question");
  });

  it("historyUpto bounds the DB replay (editAndResend fork)", async () => {
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      { id: 11, role: "user", content: "kept", images: null, tool_calls: null },
      {
        id: 12,
        role: "assistant",
        content: "kept too",
        images: null,
        tool_calls: null,
      },
      {
        id: 13,
        role: "user",
        content: "discarded fork",
        images: null,
        tool_calls: null,
      },
      {
        id: 14,
        role: "assistant",
        content: "discarded reply",
        images: null,
        tool_calls: null,
      },
    ];
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model,
      chatId: 7,
      historyUpto: 13,
      messages: [{ role: "user", content: "edited resend" }],
    });

    const sent = state.roundBodies[0].messages as { content: string }[];
    const joined = sent.map((m) => m.content).join("\n");
    expect(joined).toContain("kept too");
    expect(joined).toContain("edited resend");
    expect(joined).not.toContain("discarded fork");
    expect(joined).not.toContain("discarded reply");
    expect(sent.map((m) => m.content)).toEqual([
      expect.any(String),
      "kept",
      "kept too",
      "edited resend",
    ]);
  });

  it("summary_upto bounds the replay from below", async () => {
    state.chat = { id: 7, summary: null, summary_upto: 11 };
    state.turns = [
      {
        id: 11,
        role: "user",
        content: "summarized away",
        images: null,
        tool_calls: null,
      },
      { id: 12, role: "user", content: "kept", images: null, tool_calls: null },
    ];
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model,
      chatId: 7,
      messages: [{ role: "user", content: "kept" }],
    });

    const sent = state.roundBodies[0].messages as { content: string }[];
    expect(sent.map((m) => m.content).join("\n")).not.toContain(
      "summarized away",
    );
    expect(sent.map((m) => m.content).join("\n")).toContain("kept");
  });

  it("tool results replay into context under the budget, oldest first", async () => {
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      {
        id: 11,
        role: "user",
        content: "read the file",
        images: null,
        tool_calls: null,
      },
      {
        id: 12,
        role: "assistant",
        content: "answer one",
        images: null,
        tool_calls: JSON.stringify([{ tool: "read_file", status: "done" }]),
      },
      {
        id: 13,
        role: "user",
        content: "follow-up",
        images: null,
        tool_calls: null,
      },
      {
        id: 14,
        role: "assistant",
        content: "answer two",
        images: null,
        tool_calls: JSON.stringify([{ tool: "read_file", status: "done" }]),
      },
    ];
    state.toolResults = [
      { message_id: 12, call_index: 0, content: "FILE CONTENT A" },
      { message_id: 14, call_index: 0, content: "FILE CONTENT B" },
    ];
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model,
      chatId: 7,
      messages: [{ role: "user", content: "follow-up" }],
    });

    const sent = state.roundBodies[0].messages as {
      role: string;
      content: string;
      tool_name?: string;
    }[];
    const toolOne = sent.findIndex((m) => m.role === "tool");
    expect(toolOne).toBeGreaterThan(-1);
    expect(sent[toolOne]).toMatchObject({
      role: "tool",
      tool_name: "read_file",
      content: "FILE CONTENT A",
    });
    expect(sent.slice(0, toolOne).some((m) => m.content === "answer one")).toBe(
      true,
    );
    const toolTwo = sent.slice(toolOne + 1).find((m) => m.role === "tool");
    expect(toolTwo).toMatchObject({
      role: "tool",
      tool_name: "read_file",
      content: "FILE CONTENT B",
    });
    expect(sent.some((m) => m.content === "answer two")).toBe(true);
  });

  it("replay budget trims the oldest results first", async () => {
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      { id: 11, role: "user", content: "q1", images: null, tool_calls: null },
      {
        id: 12,
        role: "assistant",
        content: "a1",
        images: null,
        tool_calls: null,
      },
      { id: 13, role: "user", content: "q2", images: null, tool_calls: null },
      {
        id: 14,
        role: "assistant",
        content: "a2",
        images: null,
        tool_calls: null,
      },
    ];
    // ~7.5k tokens of results: both turns fit under the 6k budget? No —
    // each is 3.75k, together over. Oldest wins; newest is dropped.
    state.toolResults = [
      { message_id: 12, call_index: 0, content: "X".repeat(15_000) },
      { message_id: 14, call_index: 0, content: "Y".repeat(15_000) },
    ];
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model,
      chatId: 7,
      messages: [{ role: "user", content: "q3" }],
    });

    const sent = state.roundBodies[0].messages as {
      role: string;
      content: string;
    }[];
    const toolContents = sent
      .filter((m) => m.role === "tool")
      .map((m) => m.content);
    expect(toolContents).toEqual(["Y".repeat(15_000)]);
  });

  it("legacy request: client messages pass through untouched", async () => {
    scriptReply("ok");
    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model,
      messages: [
        { role: "system", content: "client-built" },
        { role: "user", content: "go" },
      ],
    });
    const sent = state.roundBodies[0].messages as {
      role: string;
      content: string;
    }[];
    expect(sent[0].role).toBe("system");
    expect(sent[0].content).toContain("client-built");
  });

  it("unknown chatId falls back to the client messages", async () => {
    scriptReply("ok");
    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model,
      chatId: 999,
      messages: [
        { role: "system", content: "client-built" },
        { role: "user", content: "go" },
      ],
    });
    const sent = state.roundBodies[0].messages as {
      role: string;
      content: string;
    }[];
    expect(sent[0].role).toBe("system");
    expect(sent[0].content).toContain("client-built");
  });
  it("compacts on the measured prompt, not on a guess from message text", async () => {
    // 26k measured against a 32,768 window clears the 24,576 compact mark.
    // Counting these two short turns' characters would read ~10 and never fire.
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      { id: 11, role: "user", content: "hi", images: null, tool_calls: null },
      {
        id: 12,
        role: "assistant",
        content: "hello",
        images: null,
        tool_calls: null,
        prompt_tokens: 26_000,
      },
      {
        id: 13,
        role: "user",
        content: "and again",
        images: null,
        tool_calls: null,
      },
    ];
    state.compactTo = 12;
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model: { ...model, contextLength: 32_768 },
      chatId: 7,
      messages: [{ role: "user", content: "and again" }],
    });
    expect(state.compactCalls).toEqual([7]);
  });

  it("compacts a 4k chat whose last reply alone overruns the window", async () => {
    // Chat 403 verbatim: 3,012 measured, a 4,774-char reply, 4,096 window.
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      {
        id: 11,
        role: "user",
        content: "x".repeat(33),
        images: null,
        tool_calls: null,
      },
      {
        id: 12,
        role: "assistant",
        content: "y".repeat(4774),
        images: null,
        tool_calls: null,
        prompt_tokens: 3_012,
      },
      {
        id: 13,
        role: "user",
        content: "z".repeat(40),
        images: null,
        tool_calls: null,
      },
    ];
    state.compactTo = 12;
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model: { ...model, contextLength: 4_096 },
      chatId: 7,
      messages: [{ role: "user", content: "z".repeat(40) }],
    });
    // 3,012 + 1,203 estimated clears the 3,072 mark.
    expect(state.compactCalls).toEqual([7]);
  });

  it("retries the compact on the next message after a failed one", async () => {
    // First send: compact throws, the request proceeds un-compacted.
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      {
        id: 11,
        role: "user",
        content: "x".repeat(33),
        images: null,
        tool_calls: null,
      },
      {
        id: 12,
        role: "assistant",
        content: "y".repeat(4774),
        images: null,
        tool_calls: null,
        prompt_tokens: 3_012,
      },
      {
        id: 13,
        role: "user",
        content: "z".repeat(40),
        images: null,
        tool_calls: null,
      },
    ];
    state.compactTo = null;
    scriptReply("ok");
    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model: { ...model, contextLength: 4_096 },
      chatId: 7,
      messages: [{ role: "user", content: "z".repeat(40) }],
    });
    expect(state.compactCalls).toEqual([7]);

    // Second send right after: the failure gate blocks a second attempt.
    state.compactCalls.length = 0;
    state.compactTo = 12;
    scriptReply("ok");
    await collect({
      requestId: 901,
      host: "http://127.0.0.1:11434",
      model: { ...model, contextLength: 4_096 },
      chatId: 7,
      messages: [{ role: "user", content: "z".repeat(40) }],
    });
    expect(state.compactCalls).toEqual([]);
  });

  it("leaves a chat alone while the measured prompt fits", async () => {
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      { id: 11, role: "user", content: "hi", images: null, tool_calls: null },
      {
        id: 12,
        role: "assistant",
        content: "hello",
        images: null,
        tool_calls: null,
        prompt_tokens: 9_000,
      },
    ];
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model: { ...model, contextLength: 32_768 },
      chatId: 7,
      messages: [{ role: "user", content: "more" }],
    });
    expect(state.compactCalls).toEqual([]);
  });

  it("ignores a measurement taken before the summary boundary", async () => {
    // Reusing turn 11's 30k would re-compact an already compacted chat.
    state.chat = { id: 7, summary: "earlier", summary_upto: 11 };
    state.turns = [
      {
        id: 11,
        role: "assistant",
        content: "old",
        images: null,
        tool_calls: null,
        prompt_tokens: 30_000,
      },
      { id: 12, role: "user", content: "next", images: null, tool_calls: null },
    ];
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model: { ...model, contextLength: 32_768 },
      chatId: 7,
      messages: [{ role: "user", content: "next" }],
    });
    expect(state.compactCalls).toEqual([]);
  });

  it("counts the pending client turn on the edit path", async () => {
    // The resend carries no row id yet.
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      {
        id: 11,
        role: "assistant",
        content: "hello",
        images: null,
        tool_calls: null,
        prompt_tokens: 24_000,
      },
    ];
    state.compactTo = 11;
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model: { ...model, contextLength: 32_768 },
      chatId: 7,
      historyUpto: 12,
      messages: [{ role: "user", content: "x".repeat(8_000) }],
    });
    // 24,000 measured alone is under; + 2,000 for the paste clears 24,576.
    expect(state.compactCalls).toEqual([7]);
  });

  it("drops the summarized turns from the very request that compacted", async () => {
    state.chat = { id: 7, summary: null, summary_upto: null };
    state.turns = [
      {
        id: 11,
        role: "user",
        content: "ancient history",
        images: null,
        tool_calls: null,
      },
      {
        id: 12,
        role: "assistant",
        content: "long answer",
        images: null,
        tool_calls: null,
        prompt_tokens: 26_000,
      },
      {
        id: 13,
        role: "user",
        content: "still here",
        images: null,
        tool_calls: null,
      },
    ];
    state.compactTo = 12;
    scriptReply("ok");

    await collect({
      requestId: 900,
      host: "http://127.0.0.1:11434",
      model: { ...model, contextLength: 32_768 },
      chatId: 7,
      messages: [{ role: "user", content: "still here" }],
    });

    const sent = state.roundBodies[0].messages as {
      role: string;
      content: string;
    }[];
    const joined = sent.map((m) => m.content).join("\n");
    expect(joined).toContain("SUMMARY-OF-EARLIER");
    expect(joined).not.toContain("ancient history");
    expect(joined).not.toContain("long answer");
    expect(sent.map((m) => m.content)).toEqual([
      expect.any(String),
      "still here",
    ]);
  });
});
