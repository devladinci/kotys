import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { useAppStore } from "../shared/useAppStore.js";
import {
  isChatBusy,
  getStreamingId,
  resetStreamState,
  startStreamEntry,
} from "./streamState.js";
import { subscribeChatSync } from "./chatSync.js";
import {
  claimLiveStream,
  markStreamStopped,
  resetLiveStreams,
} from "./liveStreams.js";
import type { ServerMessage } from "@kotys/api";

/**
 * Cross-device sync of the busy state: a client that merely watches a chat
 * another client streams into must show Stop, and the state must clear on
 * done/error frames — including for background chats. Frames of a stream
 * this client stopped are late: they must not re-mark a chat whose next
 * turn is already streaming. A reconnect re-confirms stuck viewer entries.
 */

const socketListeners = new Set<(msg: ServerMessage) => void>();
const statusListeners = new Set<(status: string) => void>();
/** Daemon answers for the liveStream probe; absent = null. */
const liveStreamProbe = new Map<number, number | null>();
const probedChatIds: number[] = [];
const probeError = { now: false };

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
  getRpc: () => ({
    chats: {
      liveStream: async ({ chatId }: { chatId: number }) => {
        probedChatIds.push(chatId);
        if (probeError.now) throw new Error("daemon unreachable");
        return liveStreamProbe.get(chatId) ?? null;
      },
    },
  }),
}));

const doneResult = {
  content: "done",
  thinking: "",
  promptTokens: 0,
  evalTokens: 0,
  tokensMeasured: false,
  toolCalls: [],
};

const streamFrame = (
  chatId: number,
  requestId: number,
  type: "chat:chunk" | "chat:tool" | "chat:done" | "chat:error" = "chat:chunk",
): ServerMessage => {
  const payload: Record<string, unknown> = { requestId };
  if (type === "chat:chunk") {
    payload.thinkingDelta = "";
    payload.contentDelta = "x";
  }
  if (type === "chat:done") payload.result = doneResult;
  if (type === "chat:error") payload.error = "boom";
  return { type, seq: 1, chatId, payload } as unknown as ServerMessage;
};

describe("chatSync: cross-device busy state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreamState();
    resetLiveStreams();
    liveStreamProbe.clear();
    probedChatIds.length = 0;
    probeError.now = false;
    useAppStore.setState({ knownChatIds: new Set([7]), chatsVersion: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("keeps a done frame for another chat's stream from clearing this chat", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42, "chat:chunk")));
    socketListeners.forEach((cb) => cb(streamFrame(8, 99, "chat:done")));

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

  it("marks busy from a progress pulse", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) =>
      cb({
        type: "messages:progress",
        payload: { chatId: 7, messageId: 42 },
      }),
    );

    expect(isChatBusy(7)).toBe(true);
    expect(getStreamingId(7)).toBe(42);
  });

  it("never overwrites an existing entry: the next turn keeps its own id", () => {
    subscribeChatSync();
    // The queue drains into a new turn while the stopped stream's last
    // progress pulse is still in flight.
    startStreamEntry(7, 9000);
    socketListeners.forEach((cb) => cb(streamFrame(7, 42)));

    expect(getStreamingId(7)).toBe(9000);
  });

  it("late frames of a stream this client stopped do not re-mark the chat", () => {
    markStreamStopped(42);
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42)));

    expect(isChatBusy(7)).toBe(false);
  });

  it("late done of a stopped stream does not clear the next turn's state", () => {
    markStreamStopped(42);
    subscribeChatSync();
    startStreamEntry(7, 9000);
    socketListeners.forEach((cb) => cb(streamFrame(7, 42, "chat:done")));

    expect(isChatBusy(7)).toBe(true);
    expect(getStreamingId(7)).toBe(9000);
  });

  it("a lost chat:done does not leave a stopped id poisoned forever", async () => {
    // Stop → the socket drops right before the final chat:done → reconnect.
    // The stopped id must heal: a regenerate of the same row (the id is the
    // row) started on another device marks the chat busy here again.
    markStreamStopped(42);
    subscribeChatSync();
    startStreamEntry(7, 9000);
    socketListeners.forEach((cb) => cb(streamFrame(7, 42, "chat:done")));

    liveStreamProbe.set(7, 9000);
    await act(async () => {
      statusListeners.forEach((cb) => cb("connected"));
    });

    socketListeners.forEach((cb) => cb(streamFrame(7, 42)));
    expect(isChatBusy(7)).toBe(true);
  });

  it("a stuck viewer entry clears on reconnect when the daemon moved on", async () => {
    // Frames marked the chat busy; the chat:done was lost to a socket drop.
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42)));
    expect(isChatBusy(7)).toBe(true);

    liveStreamProbe.set(7, null);
    await act(async () => {
      statusListeners.forEach((cb) => cb("connected"));
    });

    expect(isChatBusy(7)).toBe(false);
    expect(probedChatIds).toContain(7);
  });

  it("a failed reconnect probe keeps a stuck viewer entry", async () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(streamFrame(7, 42)));
    probeError.now = true;
    await act(async () => {
      statusListeners.forEach((cb) => cb("connected"));
    });

    // One failed request (daemon briefly down) must not clear the state.
    expect(isChatBusy(7)).toBe(true);
  });

  it("reconnect heal never touches a stream this client owns", async () => {
    claimLiveStream(9000, 7);
    subscribeChatSync();
    startStreamEntry(7, 9000);

    liveStreamProbe.set(7, null);
    await act(async () => {
      statusListeners.forEach((cb) => cb("connected"));
    });

    expect(isChatBusy(7)).toBe(true);
  });
});
