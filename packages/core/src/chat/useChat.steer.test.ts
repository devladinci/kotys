import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const sent: unknown[] = [];
  const inserts: unknown[] = [];
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
  return { sent, inserts, listeners, net, socket };
});

vi.mock("../shared/clients.js", () => ({
  getSocket: () => h.socket,
  getRpc: () => ({
    messages: {
      insert: async (input: unknown) => {
        h.inserts.push(input);
        return 9000 + h.inserts.length;
      },
      update: async () => {},
      list: async () => [],
      get: async () => null,
    },
    chats: {
      liveStream: async () => null,
    },
    skills: {
      get: async () => null,
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

const { resetStreamState, startStreamEntry, finishStreamEntry } =
  await import("./streamState.js");
const { resetLiveStreams, claimLiveStream, releaseLiveStream } =
  await import("./liveStreams.js");
const { resetQueued, enqueueQueued, getQueued } =
  await import("./queueStore.js");
const { resetEchoGuard } = await import("./echoGuard.js");
const { useAppStore } = await import("../shared/useAppStore.js");

const { useChat } = await import("./useChat.js");
const { renderHook, act, waitFor } = await import("@testing-library/react");

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

function liveTurn() {
  startStreamEntry(7, 500);
  claimLiveStream(500, 7);
}

const steerEntry = (key: string) => ({
  tool: "steer",
  status: "done",
  textOffset: 0,
  widget: { kind: "steer", text: "stop, wrong file", id: key },
});

const dispatch = (frame: unknown) => {
  for (const listener of h.listeners) listener(frame);
};

function receipt(key: string) {
  dispatch({
    type: "chat:tool",
    seq: 1,
    chatId: 7,
    payload: { requestId: 500, index: 0, ...steerEntry(key) },
  });
}

describe("useChat steer", () => {
  beforeEach(() => {
    h.sent.length = 0;
    h.inserts.length = 0;
    h.net.online = true;
    resetStreamState();
    resetLiveStreams();
    resetQueued();
    resetEchoGuard();
    useAppStore.setState({ apiKeyPresent: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a queued message to the live turn and holds it until the receipt", () => {
    liveTurn();
    enqueueQueued(7, "stop, wrong file", []);
    const [queued] = getQueued(7);

    const { result } = renderChat(7);
    act(() => result.current.steer(queued.id));

    const [append] = sentOf("chat:append");

    expect(append.payload).toMatchObject({
      requestId: 500,
      content: "stop, wrong file",
    });

    const key = append.payload.id as string;
    expect(key).toEqual(expect.any(String));

    expect(getQueued(7)).toEqual([
      { ...queued, steer: { requestId: 500, key } },
    ]);

    expect(h.inserts).toEqual([]);

    act(() => receipt(key));
    expect(result.current.queuedMessages).toEqual([]);
  });

  it("offers a message to a turn only once", () => {
    liveTurn();
    enqueueQueued(7, "stop, wrong file", []);
    const [queued] = getQueued(7);

    const { result } = renderChat(7);
    act(() => result.current.steer(queued.id));
    act(() => result.current.steer(queued.id));

    expect(sentOf("chat:append")).toHaveLength(1);
  });

  it("leaves the message queued when no turn is running", () => {
    enqueueQueued(7, "later", []);
    const [queued] = getQueued(7);

    const { result } = renderChat(7);
    act(() => result.current.steer(queued.id));

    expect(sentOf("chat:append")).toEqual([]);
    expect(getQueued(7)[0]?.steer).toBeUndefined();
  });

  it("keeps a message with images for its own turn", () => {
    liveTurn();
    enqueueQueued(7, "look at this", ["data:image/png;base64,AAAA"]);
    const [queued] = getQueued(7);

    const { result } = renderChat(7);
    act(() => result.current.steer(queued.id));

    expect(sentOf("chat:append")).toEqual([]);
    expect(getQueued(7)[0].steer).toBeUndefined();
  });

  it("does not mark a message the socket could not send", () => {
    liveTurn();
    enqueueQueued(7, "stop, wrong file", []);
    const [queued] = getQueued(7);
    h.net.online = false;

    const { result } = renderChat(7);
    act(() => result.current.steer(queued.id));

    expect(getQueued(7)[0].steer).toBeUndefined();
  });

  it("sends an unconfirmed steer as a normal message once the turn ends", async () => {
    liveTurn();
    enqueueQueued(7, "stop, wrong file", []);
    const [queued] = getQueued(7);

    const { result } = renderChat(7);
    act(() => result.current.steer(queued.id));
    expect(sentOf("chat:stream")).toEqual([]);

    // The turn ends without a receipt.
    act(() => {
      releaseLiveStream(500);
      finishStreamEntry(7);
    });

    await waitFor(() => expect(sentOf("chat:stream")).toHaveLength(1));
    const messages = sentOf("chat:stream")[0].payload.messages as unknown[];

    expect(messages.at(-1)).toMatchObject({
      role: "user",
      content: "stop, wrong file",
    });

    expect(getQueued(7)).toEqual([]);
  });

  it("settles a steer from the done frame's trace when its receipt was missed", async () => {
    liveTurn();
    enqueueQueued(7, "stop, wrong file", []);
    const [queued] = getQueued(7);

    const { result } = renderChat(7);
    act(() => result.current.steer(queued.id));
    const key = sentOf("chat:append")[0].payload.id as string;

    // Replay buffer gone: only the terminal frame, rebuilt from the row.
    await act(async () => {
      dispatch({
        type: "chat:done",
        seq: 0,
        chatId: 7,
        payload: {
          requestId: 500,
          result: {
            content: "done",
            thinking: "",
            promptTokens: 0,
            evalTokens: 0,
            tokensMeasured: false,
            toolCalls: [steerEntry(key)],
          },
        },
      });

      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getQueued(7)).toEqual([]);
    expect(sentOf("chat:stream")).toEqual([]);
  });

  it("drains a queued message into a new turn once the chat is idle", async () => {
    enqueueQueued(7, "next question", []);

    renderChat(7);

    await act(async () => {
      await Promise.resolve();
    });

    expect(sentOf("chat:stream")[0]).toBeDefined();
  });
});
