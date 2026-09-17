import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const sent: unknown[] = [];
  const inserts: { role: string }[] = [];
  const userInsert: { mode: "ok" | "null" | "throw" } = { mode: "ok" };
  const skill: {
    mode: "ok" | "hang";
    resolve: ((value: unknown) => void) | null;
  } = { mode: "ok", resolve: null };
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
  return { sent, inserts, userInsert, skill, listeners, net, socket };
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
      update: async () => {},
      list: async () => [],
      get: async () => null,
    },
    chats: {
      liveStream: async () => null,
    },
    skills: {
      get: async () => {
        if (h.skill.mode === "hang") {
          return new Promise((resolve) => {
            h.skill.resolve = resolve;
          });
        }
        return null;
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

describe("useChat send", () => {
  beforeEach(() => {
    h.sent.length = 0;
    h.inserts.length = 0;
    h.net.online = true;
    h.userInsert.mode = "ok";
    h.skill.mode = "ok";
    h.skill.resolve = null;
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

    // The first turn streams, then the queue drains the held message.
    expect(sentOf("chat:stream")).toHaveLength(2);
    expect(getQueued(7)).toHaveLength(0);
    expect(isChatBusy(7)).toBe(false);
  });
});
