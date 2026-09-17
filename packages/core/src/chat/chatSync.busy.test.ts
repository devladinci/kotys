import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../shared/useAppStore.js";
import { isChatBusy, getStreamingId, resetStreamState } from "./streamState.js";
import { subscribeChatSync } from "./chatSync.js";
import type { ServerMessage } from "@kotys/api";

/**
 * Cross-device sync of the busy state: a client that merely watches a chat
 * another client streams into must show Stop, and the state must clear on
 * done/error frames — including for background chats.
 */

const socketListeners = new Set<(msg: ServerMessage) => void>();
const statusListeners = new Set<(status: string) => void>();

vi.mock("../shared/clients.js", () => ({
  getSocket: () => ({
    on: (cb: (msg: ServerMessage) => void) => {
      socketListeners.add(cb);
      return () => socketListeners.delete(cb);
    },
    onStatus: (cb: (status: string) => void) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  }),
}));

const streamFrame = (
  chatId: number,
  requestId: number,
  type: "chat:chunk" | "chat:tool" | "chat:done" | "chat:error" = "chat:chunk",
): ServerMessage =>
  ({
    type,
    seq: 1,
    chatId,
    payload: {
      requestId,
      ...(type === "chat:chunk"
        ? { thinkingDelta: "", contentDelta: "x" }
        : {}),
      ...(type === "chat:done"
        ? {
            result: {
              content: "done",
              thinking: "",
              promptTokens: 0,
              evalTokens: 0,
              tokensMeasured: false,
              toolCalls: [],
            },
          }
        : {}),
      ...(type === "chat:error" ? { error: "boom" } : {}),
    },
  }) as unknown as ServerMessage;

const { claimLiveStream } = await import("./liveStreams.js");
const { resetLiveStreams } = await import("./liveStreams.js");

describe("chatSync: cross-device busy state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreamState();
    resetLiveStreams();
    useAppStore.setState({ knownChatIds: new Set([7]), chatsVersion: 0 });
  });

  it("marks the chat busy on a foreign stream frame and exposes its requestId", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42)));

    expect(isChatBusy(7)).toBe(true);
    expect(getStreamingId(7)).toBe(42);
  });

  it("clears the busy state on chat:done", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42, "chat:chunk")));
    socketListeners.forEach((cb) => cb(streamFrame(7, 42, "chat:done")));

    expect(isChatBusy(7)).toBe(false);
    expect(getStreamingId(7)).toBeNull();
  });

  it("clears the busy state on chat:error", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42, "chat:chunk")));
    socketListeners.forEach((cb) => cb(streamFrame(7, 42, "chat:error")));

    expect(isChatBusy(7)).toBe(false);
  });

  it("keeps the owner state untouched: an owned requestId is not re-marked", () => {
    claimLiveStream(42, 7);
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42)));

    expect(isChatBusy(7)).toBe(false);
  });

  it("keeps an own done frame from clearing a foreign stream's state", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42, "chat:chunk")));
    socketListeners.forEach((cb) => cb(streamFrame(7, 99, "chat:done")));

    expect(isChatBusy(7)).toBe(true);
  });

  it("marks a background chat busy and clears it there too", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(8, 55, "chat:chunk")));
    expect(isChatBusy(8)).toBe(true);

    socketListeners.forEach((cb) => cb(streamFrame(8, 55, "chat:done")));
    expect(isChatBusy(8)).toBe(false);
  });

  it("does not mark busy for a frame without a chatId", () => {
    const untyped = {
      type: "chat:chunk",
      seq: 1,
      payload: { requestId: 3, thinkingDelta: "", contentDelta: "x" },
    } as unknown as ServerMessage;
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(untyped));

    expect(isChatBusy(7)).toBe(false);
  });
});
