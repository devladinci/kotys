import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The WS manager is the sync boundary between devices: it fans stream frames
 * out to every client, persists stream results server-side (a locked phone
 * must not lose the reply), answers resume with a DB fallback when the replay
 * buffer is gone, and replies to heartbeats. These tests pin all of that.
 */

const h = vi.hoisted(() => ({
  streamChat: vi.fn(),
  updateMessage: vi.fn(),
  getMessage: vi.fn(),
  getChatIdForMessage: vi.fn(),
  eventHandlers: {} as Record<string, (...args: unknown[]) => void>,
}));

vi.mock("../services/chatStream.js", () => ({
  streamChat: h.streamChat,
}));
vi.mock("@kotys/db", () => ({
  updateMessage: h.updateMessage,
  getMessage: h.getMessage,
  getChatIdForMessage: h.getChatIdForMessage,
  getChatById: () => null,
}));
vi.mock("../services/events.js", () => ({
  events: {
    onEvent: (name: string, cb: (...args: unknown[]) => void) => {
      h.eventHandlers[name] = cb;
    },
    emitEvent: (name: string, payload: unknown) => {
      h.eventHandlers[name]?.(payload);
    },
  },
}));

import type { ChatStreamResult } from "@kotys/contracts";
import type { ClientMessage, ServerMessage } from "./protocol.js";
import { onMessage, onOpen } from "./manager.js";
import { resetStreams } from "./streams.js";

type FakeWs = {
  id: string;
  sent: ServerMessage[];
  ws: {
    send: (data: string) => void;
  };
};

/** onOpen assigns its own uuid; tests send messages under that id. */
const connect = (): FakeWs => {
  const fake: FakeWs = {
    id: "",
    sent: [],
    ws: { send: (data: string) => void fake.sent.push(JSON.parse(data)) },
  };
  fake.id = onOpen(fake.ws as never);
  return fake;
};

const send = async (client: FakeWs, msg: ClientMessage): Promise<void> => {
  await onMessage(client.id, JSON.stringify(msg));
};

const result = (content: string): ChatStreamResult => ({
  content,
  thinking: "",
  promptTokens: 1,
  evalTokens: 2,
  toolCalls: [],
});

const streamReq = (requestId: number, chatId?: number): ClientMessage => ({
  type: "chat:stream",
  payload: {
    requestId,
    ...(chatId !== undefined ? { chatId } : {}),
    host: "http://x",
    model: {
      name: "m",
      capabilities: [],
      contextLength: 1000,
      source: "local" as const,
    },
    messages: [],
  },
});

beforeEach(() => {
  resetStreams();
  h.streamChat.mockReset();
  h.updateMessage.mockReset();
  h.getMessage.mockReset();
  h.getChatIdForMessage.mockReset();
});

describe("ws manager: ping/pong", () => {
  it("answers a heartbeat", async () => {
    const fake = connect();
    await send(fake, { type: "ping" });
    expect(fake.sent).toEqual([
      expect.objectContaining({ type: "ready" }),
      { type: "pong" },
    ]);
  });
});

describe("ws manager: fan-out", () => {
  it("sends chunk frames to every connected client", async () => {
    const a = connect();
    const b = connect();
    h.getChatIdForMessage.mockReturnValue(5);
    h.streamChat.mockImplementation(
      async (
        _req: unknown,
        cbs: {
          onChunk: (c: { thinkingDelta: string; contentDelta: string }) => void;
        },
      ) => {
        cbs.onChunk({ thinkingDelta: "t", contentDelta: "hello" });
        return result("hello");
      },
    );
    await send(a, streamReq(9, 5));
    expect(a.sent.some((m) => m.type === "chat:chunk" && m.chatId === 5)).toBe(
      true,
    );
    expect(b.sent.some((m) => m.type === "chat:chunk" && m.chatId === 5)).toBe(
      true,
    );
  });

  it("persists the final result and broadcasts messages:changed", async () => {
    const fake = connect();
    h.getMessage.mockReturnValue({ id: 9, role: "assistant", content: "" });
    h.getChatIdForMessage.mockReturnValue(5);
    h.streamChat.mockResolvedValue(result("final text"));
    await send(fake, streamReq(9, 5));
    expect(h.updateMessage).toHaveBeenCalledWith(9, {
      content: "final text",
      promptTokens: 1,
      evalTokens: 2,
    });
    expect(
      fake.sent.some((m) => m.type === "chat:done" && m.chatId === 5),
    ).toBe(true);
  });

  it("persists a partial error result instead of losing the content", async () => {
    const fake = connect();
    h.getMessage.mockReturnValue({
      id: 9,
      role: "assistant",
      content: "partial answer",
      thinking: null,
    });
    h.getChatIdForMessage.mockReturnValue(5);
    h.streamChat.mockRejectedValue(new Error("boom"));
    await send(fake, streamReq(9, 5));
    // No result on the error path: the token counts must stay NULL, not 0.
    expect(h.updateMessage).toHaveBeenCalledWith(9, {
      content: "partial answer\n\n**Error:** Error: boom",
    });
    expect(fake.sent.some((m) => m.type === "chat:error")).toBe(true);
  });

  it("keeps NULL counts when the stream reported no usage", async () => {
    const fake = connect();
    h.getMessage.mockReturnValue({ id: 9, role: "assistant", content: "" });
    h.getChatIdForMessage.mockReturnValue(5);
    h.streamChat.mockResolvedValue({
      content: "unmeasured",
      thinking: "",
      promptTokens: 0,
      evalTokens: 0,
      toolCalls: [],
    });
    await send(fake, streamReq(9, 5));
    // 0 means "no measurement" — writing it would fake a measured anchor.
    expect(h.updateMessage).toHaveBeenCalledWith(9, {
      content: "unmeasured",
    });
  });
});

describe("ws manager: chat:resume", () => {
  it("replays buffered frames past lastSeq", async () => {
    const a = connect();
    h.getChatIdForMessage.mockReturnValue(5);
    h.streamChat.mockImplementation(
      async (
        _req: unknown,
        cbs: {
          onChunk: (c: { thinkingDelta: string; contentDelta: string }) => void;
        },
      ) => {
        cbs.onChunk({ thinkingDelta: "", contentDelta: "one" });
        cbs.onChunk({ thinkingDelta: "", contentDelta: "two" });
        return result("onetwo");
      },
    );
    await send(a, streamReq(9, 5));
    // A second client resumes from seq 0 and gets the whole buffered stream.
    const b = connect();
    await send(b, {
      type: "chat:resume",
      payload: { requestId: 9, lastSeq: 0 },
    });
    const chunks = b.sent.filter((m) => m.type === "chat:chunk");
    expect(chunks).toHaveLength(2);
    expect(chunks.map((m) => m.seq)).toEqual([1, 2]);
  });

  it("falls back to a DB-backed chat:done when the buffer is gone", async () => {
    const fake = connect();
    // A requestId the server has no replay buffer for (expired or restarted).
    h.getMessage.mockReturnValue({
      id: 9,
      role: "assistant",
      content: "saved",
      thinking: null,
      prompt_tokens: null,
      eval_tokens: null,
      tool_calls: null,
    });
    await send(fake, {
      type: "chat:resume",
      payload: { requestId: 9, lastSeq: 0 },
    });
    const done = fake.sent.find((m) => m.type === "chat:done");
    expect(done).toBeDefined();
    expect(done?.payload.result.content).toBe("saved");
  });

  it("synthesizes chat:error when nothing was persisted", async () => {
    const fake = connect();
    h.getMessage.mockReturnValue(undefined);
    await send(fake, {
      type: "chat:resume",
      payload: { requestId: 9, lastSeq: 0 },
    });
    const err = fake.sent.find((m) => m.type === "chat:error");
    expect(err).toBeDefined();
    expect(err?.payload.error).toBe("stream expired");
  });

  it("does not end a still-live stream with a synthesized done", async () => {
    const a = connect();
    // A stream that is still running: no frames past what the client has
    // already seen, but the request is alive and must stay open.
    let settle: (r: ChatStreamResult) => void = () => {};
    h.streamChat.mockReturnValue(
      new Promise<ChatStreamResult>((resolve) => {
        settle = resolve;
      }),
    );
    const pending = send(a, streamReq(9, 5));
    const b = connect();
    await send(b, {
      type: "chat:resume",
      payload: { requestId: 9, lastSeq: 0 },
    });
    expect(b.sent.some((m) => m.type === "chat:done")).toBe(false);
    expect(b.sent.some((m) => m.type === "chat:error")).toBe(false);
    settle(result("done now"));
    await pending;
  });
});
