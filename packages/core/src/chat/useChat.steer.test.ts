import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Steer: a queued message is injected into the running turn via chat:append.
 * Regression — steer() early-returned on isChatBusy while a turn was live,
 * so the inject button was a no-op for the whole duration of a stream.
 */

const sent: unknown[] = [];

vi.mock("../shared/clients.js", () => ({
  getSocket: () => ({
    on: () => () => {},
    onStatus: () => () => {},
    status: "connected",
    send: (msg: unknown) => void sent.push(msg),
  }),
  getRpc: () => ({
    messages: {
      insert: async () => 9000,
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
  setClients: () => ({
    on: () => () => {},
    send: (msg: unknown) => void sent.push(msg),
  }),
}));

vi.mock("../shared/provider.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../shared/provider.js")>();
  return {
    ...mod,
    useSocket: () => ({
      on: () => () => {},
      send: (msg: unknown) => void sent.push(msg),
    }),
    usePlatform: () => "web",
  };
});

const { resetStreamState, startStreamEntry } = await import("./streamState.js");
const { resetLiveStreams, claimLiveStream } = await import("./liveStreams.js");
const { resetQueued, enqueueQueued } = await import("./queueStore.js");
const { resetEchoGuard } = await import("./echoGuard.js");

const { useChat } = await import("./useChat.js");
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

describe("useChat steer", () => {
  beforeEach(() => {
    sent.length = 0;
    resetStreamState();
    resetLiveStreams();
    resetQueued();
    resetEchoGuard();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("injects a queued message into the live turn", async () => {
    startStreamEntry(7, 500);
    claimLiveStream(500, 7);
    enqueueQueued(7, "stop, wrong file", []);

    const { result } = renderChat(7);
    await act(async () => {
      await result.current.steer(1);
    });

    const append = sent.find(
      (m) => (m as { type: string }).type === "chat:append",
    );
    expect(append).toBeDefined();
    expect((append as { payload: { content: string } }).payload.content).toBe(
      "stop, wrong file",
    );
  });

  it("leaves the message queued when no turn is running", async () => {
    enqueueQueued(7, "later", []);

    const { result } = renderChat(7);
    await act(async () => {
      await result.current.steer(1);
    });

    expect(
      sent.find((m) => (m as { type: string }).type === "chat:append"),
    ).toBeUndefined();
  });
});
