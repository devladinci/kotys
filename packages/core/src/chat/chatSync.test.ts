import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../shared/useAppStore.js";
import { subscribeChatSync } from "./chatSync.js";
import type { ServerMessage } from "@kotys/api";

/**
 * The heal: a stream frame naming a chat the local list has never seen
 * (broadcasts lost while disconnected, or the chat was created elsewhere)
 * must bump chatsVersion so the list refetches. Frames for known chats and
 * non-chat messages must not.
 */
const socketListeners = new Set<(msg: ServerMessage) => void>();
const statusListeners = new Set<(status: string) => void>();
const socket = {
  on: (cb: (msg: ServerMessage) => void) => {
    socketListeners.add(cb);
    return () => socketListeners.delete(cb);
  },
  onStatus: (cb: (status: string) => void) => {
    statusListeners.add(cb);
    return () => statusListeners.delete(cb);
  },
};

vi.mock("../shared/clients.js", () => ({
  getSocket: () => socket,
}));

const frame = (
  chatId: number,
  type: "chat:chunk" | "chat:done" = "chat:chunk",
): ServerMessage =>
  ({
    type: "chat:chunk",
    seq: 1,
    chatId,
    payload: { requestId: 1, thinkingDelta: "", contentDelta: "x" },
    ...(type === "chat:chunk" ? {} : {}),
  }) as unknown as ServerMessage;

const bumpCount = () => {
  const before = useAppStore.getState().chatsVersion;
  vi.advanceTimersByTime(250);
  return useAppStore.getState().chatsVersion - before;
};

describe("subscribeChatSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({ knownChatIds: new Set([7]), chatsVersion: 0 });
  });

  it("bumps when a stream frame names an unknown chat", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(frame(9)));
    expect(bumpCount()).toBe(1);
  });

  it("does not bump for a known chat", () => {
    subscribeChatSync();
    socketListeners.forEach((cb) => cb(frame(7)));
    expect(bumpCount()).toBe(0);
  });

  it("bumps when the connection is (re)established", () => {
    subscribeChatSync();
    for (const cb of statusListeners) cb("connected");
    expect(bumpCount()).toBe(1);
  });
});
