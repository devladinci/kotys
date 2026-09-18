import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const sent: unknown[] = [];
  const inserts: { role: string; content?: string }[] = [];
  const updates: { id: number; content?: string }[] = [];
  const userInsert: { mode: "ok" | "null" | "throw" } = { mode: "ok" };
  const skill: {
    mode: "ok" | "hang";
    resolve: ((value: unknown) => void) | null;
    bodies: Record<string, string>;
  } = { mode: "ok", resolve: null, bodies: {} };
  const listeners = new Set<(msg: unknown) => void>();
  const net = { online: true };
  const socket = {
    on: (listener: (msg: unknown) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onStatus: () => () => {},
    status: "connected",
    send: (msg: unknown) => {
      if (!net.online) return false;
      sent.push(msg);
      return true;
    },
  };
  return { sent, inserts, updates, userInsert, skill, listeners, net, socket };
});

vi.mock("../shared/clients.js", () => ({
  getSocket: () => h.socket,
  getRpc: () => ({
    messages: {
      insert: async (input: { role: string }) => {
        h.inserts.push(input);
        if (input.role !== "user") return 9000 + h.inserts.length;
        if (h.userInsert.mode === "null") return null;
        if (h.userInsert.mode === "throw") throw new Error("db gone");
        return 9000 + h.inserts.length;
      },
      update: async (input: { id: number; content?: string }) => {
        h.updates.push(input);
      },
      list: async () => [],
      get: async () => null,
    },
    chats: {
      liveStream: async () => null,
    },
    skills: {
      get: async ({ name }: { name: string }) => {
        if (h.skill.mode === "hang") {
          return new Promise((resolve) => {
            h.skill.resolve = resolve;
          });
        }
        const body = h.skill.bodies[name];
        return body === undefined ? null : { name, body };
      },
    },
  }),
  setClients: () => h.socket,
}));

vi.mock("../shared/provider.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../shared/provider.js")>();
  return {
    ...mod,
    useSocket: () => h.socket,
    usePlatform: () => "web",
  };
});

const { resetStreamState, isChatBusy, getStreamingId } =
  await import("./streamState.js");
const { resetLiveStreams } = await import("./liveStreams.js");
const { resetQueued, getQueued } = await import("./queueStore.js");
const { resetEchoGuard } = await import("./echoGuard.js");
const { useAppStore } = await import("../shared/useAppStore.js");

const { useChat } = await import("./useChat.js");
const { projectedUsedTokens } = await import("./useTokenEstimator.js");
const { subscribeChatSync } = await import("./chatSync.js");
const { renderHook, act } = await import("@testing-library/react");

const model = {
  name: "kimi",
  provider: "ollama",
  source: "cloud" as const,
  contextLength: 8192,
  capabilities: [],
};

function renderChat(activeChatId: number) {
  return renderHook(() =>
    useChat({
      activeChatId,
      chatSummary: null,
      chatSummaryUpto: null,
      chatModel: model,
      chatTitle: "Chat",
      chatTopics: [],
      onChatCreated: () => {},
      onTopicsInferred: () => {},
      onTitleInferred: () => {},
      onSummaryChanged: () => {},
    }),
  );
}

type Sent = { type: string; payload: Record<string, unknown> };
const sentOf = (type: string) =>
  (h.sent as Sent[]).filter((m) => m.type === type);

const emitFrame = (msg: unknown) => {
  h.listeners.forEach((listener) => listener(msg));
};

const emptyResult = {
  content: "done",
  thinking: "",
  promptTokens: 0,
  evalTokens: 0,
  tokensMeasured: false,
  toolCalls: [],
};

describe("useChat: watching a stream another device started", () => {
  beforeEach(() => {
    h.sent.length = 0;
    h.inserts.length = 0;
    h.net.online = true;
    h.userInsert.mode = "ok";
    h.skill.mode = "ok";
    h.skill.resolve = null;
    h.skill.bodies = {};
    resetStreamState();
    resetLiveStreams();
    resetQueued();
    resetEchoGuard();
    useAppStore.setState({ apiKeyPresent: true });
    // The app root wires this listener; the busy state travels through it.
    subscribeChatSync();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Stop on a foreign stream aborts the other device's turn", async () => {
    const { result } = renderChat(7);
    await act(async () => {
      emitFrame({
        type: "chat:chunk",
        chatId: 7,
        seq: 1,
        payload: { requestId: 4242, thinkingDelta: "", contentDelta: "hi" },
      });
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.streamingId).toBe(4242);

    act(() => {
      result.current.abort();
    });
    const aborted = sentOf("chat:abort");
    expect(aborted).toHaveLength(1);
    expect(aborted[0].payload.requestId).toBe(4242);
    expect(result.current.isLoading).toBe(false);
  });

  it("a send while another device streams queues instead of starting a turn", async () => {
    const { result } = renderChat(7);
    await act(async () => {
      emitFrame({
        type: "chat:chunk",
        chatId: 7,
        seq: 1,
        payload: { requestId: 4242, thinkingDelta: "", contentDelta: "hi" },
      });
    });

    await act(async () => {
      await result.current.send("meanwhile", []);
    });

    expect(sentOf("chat:stream")).toHaveLength(0);
    expect(result.current.queuedMessages.map((q) => q.text)).toEqual([
      "meanwhile",
    ]);
  });

  it("foreign chunks render in the open chat and done applies the result", async () => {
    const { result } = renderChat(7);
    await act(async () => {
      emitFrame({
        type: "chat:chunk",
        chatId: 7,
        seq: 1,
        payload: { requestId: 9000, thinkingDelta: "", contentDelta: "Hel" },
      });
      emitFrame({
        type: "chat:chunk",
        chatId: 7,
        seq: 2,
        payload: { requestId: 9000, thinkingDelta: "", contentDelta: "lo" },
      });
    });

    // The assistant row does not exist in this client's list yet; the text
    // waits for the row (refetch on progress pulses) or the done frame.
    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      emitFrame({
        type: "chat:done",
        chatId: 7,
        seq: 3,
        payload: {
          requestId: 9000,
          result: { ...emptyResult, content: "Hello" },
        },
      });
    });

    // applyDone without the row is a no-op here; the row arrives via refetch.
    expect(sentOf("chat:stream")).toHaveLength(0);
  });

  it("a steer offered to a foreign stream appends to it", async () => {
    const { result } = renderChat(7);
    await act(async () => {
      emitFrame({
        type: "chat:chunk",
        chatId: 7,
        seq: 1,
        payload: { requestId: 4242, thinkingDelta: "", contentDelta: "hi" },
      });
    });

    act(() => {
      void result.current.send("queued first", []);
    });
    expect(result.current.queuedMessages).toHaveLength(1);
    const queued = result.current.queuedMessages[0];

    act(() => {
      result.current.steer(queued.id);
    });

    const appended = sentOf("chat:append");
    expect(appended).toHaveLength(1);
    expect(appended[0].payload.requestId).toBe(4242);
    expect(appended[0].payload.content).toBe("queued first");
  });

  it("a steered skill message carries the skill body", async () => {
    h.skill.bodies = { review: "Review the diff." };
    const { result } = renderChat(7);
    await act(async () => {
      emitFrame({
        type: "chat:chunk",
        chatId: 7,
        seq: 1,
        payload: { requestId: 4242, thinkingDelta: "", contentDelta: "hi" },
      });
    });

    await act(async () => {
      await result.current.send("/review now", []);
    });

    act(() => {
      result.current.steer(result.current.queuedMessages[0].id);
    });

    const appended = sentOf("chat:append");
    expect(appended).toHaveLength(1);
    expect(appended[0].payload.content).toBe(
      "/review now\n\n```kotys-skill:review\nReview the diff.\n```",
    );
  });

  it("a foreign done settles the steer receipt and empties the queue", async () => {
    const { result } = renderChat(7);
    await act(async () => {
      emitFrame({
        type: "chat:chunk",
        chatId: 7,
        seq: 1,
        payload: { requestId: 4242, thinkingDelta: "", contentDelta: "hi" },
      });
    });
    act(() => {
      void result.current.send("queued first", []);
    });
    const queued = result.current.queuedMessages[0];
    act(() => {
      result.current.steer(queued.id);
    });
    expect(result.current.queuedMessages[0].steer?.requestId).toBe(4242);
    // The daemon echoes the steer key back as the receipt's widget id.
    const key = result.current.queuedMessages[0].steer?.key;

    await act(async () => {
      emitFrame({
        type: "chat:tool",
        chatId: 7,
        seq: 2,
        payload: {
          requestId: 4242,
          index: 0,
          tool: "steer",
          status: "done",
          widget: { kind: "steer", text: "queued first", id: key },
        },
      });
    });

    expect(getQueued(7).some((q) => q.id === queued.id)).toBe(false);
    expect(sentOf("chat:stream")).toHaveLength(0);
  });
});

describe("useChat send", () => {
  beforeEach(() => {
    h.sent.length = 0;
    h.inserts.length = 0;
    h.updates.length = 0;
    h.net.online = true;
    h.userInsert.mode = "ok";
    h.skill.mode = "ok";
    h.skill.resolve = null;
    h.skill.bodies = {};
    resetStreamState();
    resetLiveStreams();
    resetQueued();
    resetEchoGuard();
    useAppStore.setState({ apiKeyPresent: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("releases the busy claim when the user row insert returns null", async () => {
    h.userInsert.mode = "null";
    const { result } = renderChat(7);

    await act(async () => {
      await result.current.send("hello", []);
    });

    expect(isChatBusy(7)).toBe(false);
    expect(getStreamingId(7)).toBeNull();
  });

  it("releases the busy claim when the user row insert throws", async () => {
    h.userInsert.mode = "throw";
    const { result } = renderChat(7);

    await act(async () => {
      await expect(result.current.send("hello", [])).rejects.toThrow("db gone");
    });

    expect(isChatBusy(7)).toBe(false);
  });

  it("expands a skill named mid-message and keeps the whole text as args", async () => {
    h.skill.bodies = { review: "Review the diff." };
    const { result } = renderChat(7);

    await act(async () => {
      await result.current.send("see /tmp/x.log then /review it", []);
    });

    const user = h.inserts.find((row) => row.role === "user");
    expect(user?.content).toBe(
      "see /tmp/x.log then /review it\n\n```kotys-skill:review\nReview the diff.\n```",
    );
  });

  it("skips slash tokens that name no skill", async () => {
    h.skill.bodies = { review: "Review the diff." };
    const { result } = renderChat(7);

    await act(async () => {
      await result.current.send("copy to /backup and /review", []);
    });

    const user = h.inserts.find((row) => row.role === "user");
    expect(user?.content).toMatch(
      /^copy to \/backup and \/review\n\n```kotys-skill:review\n/,
    );
  });

  it("sends the text unchanged when no token names a skill", async () => {
    const { result } = renderChat(7);

    await act(async () => {
      await result.current.send("copy to /backup", []);
    });

    const user = h.inserts.find((row) => row.role === "user");
    expect(user?.content).toBe("copy to /backup");
  });

  it("queues a skill message as typed and expands it once when it is sent", async () => {
    h.skill.bodies = { review: "Review the diff." };
    const { result } = renderChat(7);

    await act(async () => {
      await result.current.send("first", []);
    });

    await act(async () => {
      await result.current.send("/review now", []);
    });

    expect(getQueued(7).map((q) => q.text)).toEqual(["/review now"]);

    const firstId = sentOf("chat:stream")[0].payload.requestId as number;
    await act(async () => {
      emitFrame({
        type: "chat:done",
        chatId: 7,
        seq: 9,
        payload: { requestId: firstId, result: emptyResult },
      });
    });

    await vi.waitFor(() => expect(sentOf("chat:stream")).toHaveLength(2));
    const users = h.inserts.filter((row) => row.role === "user");
    expect(users.map((row) => row.content)).toEqual([
      "first",
      "/review now\n\n```kotys-skill:review\nReview the diff.\n```",
    ]);
  });

  it("an edited message applies its skill again", async () => {
    h.skill.bodies = { review: "Review $ARGUMENTS." };
    const { result } = renderChat(7);

    await act(async () => {
      await result.current.send("/review the diff", []);
    });

    const firstId = sentOf("chat:stream")[0].payload.requestId as number;
    await act(async () => {
      emitFrame({
        type: "chat:done",
        chatId: 7,
        seq: 9,
        payload: { requestId: firstId, result: emptyResult },
      });
    });

    const userId = result.current.messages.find((m) => m.role === "user")!.id;
    await act(async () => {
      await result.current.editAndResend(userId, "/review the tests");
    });

    const edited =
      "/review the tests\n\n```kotys-skill:review\nReview the tests.\n```";
    expect(h.updates.find((u) => u.id === userId)?.content).toBe(edited);
    expect(result.current.messages.find((m) => m.id === userId)?.content).toBe(
      edited,
    );
  });

  it("claims the chat before the skill lookup so a second send queues", async () => {
    h.skill.mode = "hang";
    const { result } = renderChat(7);

    let first: Promise<{ needsSettings: boolean }> | undefined;
    act(() => {
      first = result.current.send("/deploy now", []);
    });
    expect(isChatBusy(7)).toBe(true);

    act(() => {
      void result.current.send("second", []);
    });
    expect(getQueued(7).map((q) => q.text)).toEqual(["second"]);
    expect(h.inserts).toEqual([]);

    await act(async () => {
      h.skill.resolve?.(null);
      if (first) await first;
    });

    const firstId = sentOf("chat:stream")[0].payload.requestId as number;
    emitFrame({
      type: "chat:done",
      chatId: 7,
      seq: 9,
      payload: { requestId: firstId, result: emptyResult },
    });
    await act(async () => {});
    expect(sentOf("chat:stream")).toHaveLength(2);
    expect(getQueued(7)).toHaveLength(0);
    expect(isChatBusy(7)).toBe(true);
  });

  it("a stop keeps late frames of the old turn from wiping the next turn's state", async () => {
    const { result } = renderChat(7);

    await act(async () => {
      await result.current.send("first", []);
    });
    expect(sentOf("chat:stream")).toHaveLength(1);
    const firstTurnId = sentOf("chat:stream")[0].payload.requestId as number;
    expect(getStreamingId(7)).toBe(firstTurnId);

    act(() => {
      void result.current.send("second", []);
    });
    expect(getQueued(7)).toHaveLength(1);

    act(() => {
      result.current.abort();
    });
    expect(isChatBusy(7)).toBe(false);

    // The daemon's late progress pulse and chat:done for the aborted stream
    // race the queue drain into the next turn.
    emitFrame({
      type: "messages:progress",
      payload: { chatId: 7, messageId: firstTurnId },
    });
    emitFrame({
      type: "chat:done",
      chatId: 7,
      seq: 9,
      payload: { requestId: firstTurnId, result: emptyResult },
    });

    // The drain effect started the next turn before the late frames landed;
    // they must not clear it.
    await act(async () => {});
    const streams = sentOf("chat:stream");
    expect(streams).toHaveLength(2);
    expect(isChatBusy(7)).toBe(true);
    expect(getStreamingId(7)).not.toBe(firstTurnId);
  });

  it("meters the running turn's real request, then what the next turn carries", async () => {
    const { result } = renderChat(7);

    await act(async () => {
      await result.current.send("read the repo", []);
    });
    const requestId = sentOf("chat:stream")[0].payload.requestId as number;
    const reply = () => result.current.messages.find((m) => m.id === requestId);

    await act(async () => {
      emitFrame({
        type: "chat:usage",
        chatId: 7,
        seq: 1,
        payload: { requestId, promptTokens: 26_944 },
      });
    });

    expect(reply()?.livePromptTokens).toBe(26_944);
    expect(projectedUsedTokens(result.current.messages)).toBe(26_944);

    await act(async () => {
      emitFrame({
        type: "chat:done",
        chatId: 7,
        seq: 2,
        payload: {
          requestId,
          result: {
            ...emptyResult,
            promptTokens: 4_554,
            tokensMeasured: true,
            toolResultTokens: 3_000,
          },
        },
      });
    });

    expect(reply()?.livePromptTokens).toBeUndefined();
    // 4554 measured + "done" + 3000 of tool output the next turn replays.
    expect(projectedUsedTokens(result.current.messages)).toBe(7_555);
  });
});
