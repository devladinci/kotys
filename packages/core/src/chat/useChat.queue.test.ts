import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const sent: unknown[] = [];
  const inserts: { role: string; content?: string }[] = [];
  const rows: unknown[] = [];
  const live = new Map<number, number>();
  const skill: {
    mode: "ok" | "hang";
    resolvers: ((value: unknown) => void)[];
  } = { mode: "ok", resolvers: [] };
  const retry: { mode: "ok" | "hang"; resolvers: (() => void)[] } = {
    mode: "ok",
    resolvers: [],
  };
  const listeners = new Set<(msg: unknown) => void>();
  const socket = {
    on: (listener: (msg: unknown) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onStatus: () => () => {},
    status: "connected",
    send: (msg: unknown) => {
      sent.push(msg);
      return true;
    },
  };
  return { sent, inserts, rows, live, skill, retry, listeners, socket };
});

vi.mock("../shared/clients.js", () => ({
  getSocket: () => h.socket,
  getRpc: () => ({
    messages: {
      insert: async (input: { role: string }) => {
        h.inserts.push(input);
        return 9000 + h.inserts.length;
      },
      update: async () => {},
      list: async () => h.rows,
      get: async () => null,
      resetForRetry: async () => {
        if (h.retry.mode === "hang") {
          await new Promise<void>((resolve) => h.retry.resolvers.push(resolve));
        }
      },
    },
    chats: {
      liveStream: async ({ chatId }: { chatId: number }) =>
        h.live.get(chatId) ?? null,
      create: async () => 77,
    },
    skills: {
      get: async () => {
        if (h.skill.mode === "hang") {
          return new Promise((resolve) => h.skill.resolvers.push(resolve));
        }
        return null;
      },
    },
  }),
  setClients: () => h.socket,
}));

vi.mock("../shared/provider.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../shared/provider.js")>();
  return { ...mod, useSocket: () => h.socket, usePlatform: () => "web" };
});

const { resetStreamState, isChatBusy, getStreamingId } =
  await import("./streamState.js");
const { resetLiveStreams } = await import("./liveStreams.js");
const { resetQueued, getQueued, enqueueQueued } =
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

const renderChat = (activeChatId: number, strict = false) =>
  renderHook(
    ({ id }: { id: number }) =>
      useChat({
        activeChatId: id,
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
    {
      initialProps: { id: activeChatId },
      ...(strict ? { wrapper: StrictMode } : {}),
    },
  );

type Sent = { type: string; payload: Record<string, unknown> };
const streams = () =>
  (h.sent as Sent[]).filter((m) => m.type === "chat:stream");
const emitFrame = (msg: unknown) => h.listeners.forEach((l) => l(msg));

const doneResult = {
  content: "done",
  thinking: "",
  promptTokens: 0,
  evalTokens: 0,
  tokensMeasured: false,
  toolCalls: [],
};

const finish = async (requestId: number) => {
  await act(async () => {
    emitFrame({
      type: "chat:done",
      chatId: 7,
      seq: 9,
      payload: { requestId, result: doneResult },
    });
  });
};

const row = (id: number, role: string, content: string) => ({
  id,
  chat_id: 7,
  role,
  content,
  thinking: null,
  images: null,
  model_name: null,
  prompt_tokens: null,
  eval_tokens: null,
  tokens_measured: null,
  tool_calls: null,
  created_at: 0,
});

beforeEach(() => {
  h.sent.length = 0;
  h.inserts.length = 0;
  h.rows.length = 0;
  h.live.clear();
  h.skill.mode = "ok";
  h.skill.resolvers = [];
  h.retry.mode = "ok";
  h.retry.resolvers = [];
  resetStreamState();
  resetLiveStreams();
  resetQueued();
  resetEchoGuard();
  useAppStore.setState({ apiKeyPresent: true });
});

describe("useChat queue and claims", () => {
  it("sends a message held back while a skill lookup outlived the turn", async () => {
    const { result } = renderChat(7);
    await act(async () => {
      await result.current.send("first", []);
    });
    const firstId = streams()[0].payload.requestId as number;

    h.skill.mode = "hang";
    let held: Promise<unknown> | undefined;
    act(() => {
      held = result.current.send("move it to /backup please", []);
    });
    await finish(firstId);
    expect(isChatBusy(7)).toBe(false);

    await act(async () => {
      h.skill.resolvers.forEach((resolve) => resolve(null));
      await held;
    });

    await waitFor(() => expect(streams()).toHaveLength(2));
    expect(getQueued(7)).toHaveLength(0);
  });

  it("starts one turn when regenerate is clicked twice", async () => {
    h.rows.push(row(1, "user", "q"), row(2, "assistant", "old"));
    const { result } = renderChat(7);
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    h.retry.mode = "hang";
    await act(async () => {
      void result.current.regenerate(2);
    });
    await act(async () => {
      void result.current.regenerate(2);
    });
    await act(async () => {
      h.retry.resolvers.forEach((resolve) => resolve());
    });

    await waitFor(() => expect(streams()).toHaveLength(1));
  });

  it("queues a send that arrives while regenerate is still starting", async () => {
    h.rows.push(row(1, "user", "q"), row(2, "assistant", "old"));
    const { result } = renderChat(7);
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    h.retry.mode = "hang";
    await act(async () => {
      void result.current.regenerate(2);
    });
    await act(async () => {
      await result.current.send("new question", []);
    });
    expect(getQueued(7).map((q) => q.text)).toEqual(["new question"]);

    await act(async () => {
      h.retry.resolvers.forEach((resolve) => resolve());
    });
    await waitFor(() => expect(streams()).toHaveLength(1));
  });

  it("sends every queued message when the view mounts twice", async () => {
    enqueueQueued(7, "first queued", [], "first queued");
    enqueueQueued(7, "second queued", [], "second queued");

    renderChat(7, true);

    await waitFor(() => expect(streams()).toHaveLength(1));
    const sentTexts = () =>
      h.inserts.filter((row) => row.role === "user").map((row) => row.content);
    expect(sentTexts()).toEqual(["first queued"]);
    expect(getQueued(7).map((q) => q.text)).toEqual(["second queued"]);
  });

  it("keeps the next turn running when the old stream's liveness check lands", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result, rerender } = renderChat(7);
      await act(async () => {
        await result.current.send("first", []);
      });
      const first = streams()[0].payload.requestId as number;
      h.live.set(7, first);

      // Leaving and returning re-adopts the running stream, which starts the
      // liveness recheck loop.
      rerender({ id: 8 });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      rerender({ id: 7 });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
      expect(getStreamingId(7)).toBe(first);

      await act(async () => {
        await result.current.send("follow-up", []);
      });
      expect(getQueued(7)).toHaveLength(1);

      h.live.delete(7);
      await finish(first);
      await waitFor(() => expect(streams()).toHaveLength(2));
      const second = streams()[1].payload.requestId as number;
      h.live.set(7, second);

      // The adopted stream's recheck answers with the *new* turn's id.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(getStreamingId(7)).toBe(second);
      expect(isChatBusy(7)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
