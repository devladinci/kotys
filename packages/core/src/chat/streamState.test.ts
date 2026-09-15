import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  startStreamEntry,
  finishStreamEntry,
  clearChatBusy,
  isChatBusy,
  getStreamingId,
  isStreaming,
  subscribeStreaming,
  getSnapshot,
  resetStreamState,
} from "./streamState.js";

beforeEach(() => {
  resetStreamState();
});

describe("streamState", () => {
  it("starts an independent busy entry per chat", () => {
    startStreamEntry(1, 101);
    startStreamEntry(2, 102);
    expect(isChatBusy(1)).toBe(true);
    expect(isChatBusy(2)).toBe(true);
    expect(isStreaming(1)).toBe(true);
    expect(isStreaming(2)).toBe(true);
  });

  it("finishing one chat does not touch the other", () => {
    startStreamEntry(1, 101);
    startStreamEntry(2, 102);
    finishStreamEntry(1);
    expect(isChatBusy(1)).toBe(false);
    expect(isStreaming(1)).toBe(false);
    expect(getStreamingId(1)).toBeNull();
    expect(isChatBusy(2)).toBe(true);
    expect(isStreaming(2)).toBe(true);
    expect(getStreamingId(2)).toBe(102);
  });

  it("finishing a chat that never started is a no-op", () => {
    expect(() => finishStreamEntry(404)).not.toThrow();
    expect(isChatBusy(404)).toBe(false);
  });

  it("clearing busy keeps a live stream streaming", () => {
    startStreamEntry(1, 101);
    clearChatBusy(1);
    expect(isChatBusy(1)).toBe(false);
    expect(isStreaming(1)).toBe(true);
  });

  it("aborting clears both busy and streaming", () => {
    startStreamEntry(1, 101);
    clearChatBusy(1);
    expect(isChatBusy(1)).toBe(false);
    expect(isStreaming(1)).toBe(true);
    finishStreamEntry(1);
    expect(isStreaming(1)).toBe(false);
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsub = subscribeStreaming(listener);
    expect(listener).not.toHaveBeenCalled();

    startStreamEntry(1, 101);
    expect(listener).toHaveBeenCalledTimes(1);

    finishStreamEntry(1);
    expect(listener).toHaveBeenCalledTimes(2);

    // No-op changes do not notify.
    finishStreamEntry(1);
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
  });

  it("snapshot lists every streaming chat id", () => {
    expect(getSnapshot().streamingChatIds).toEqual([]);
    startStreamEntry(1, 101);
    startStreamEntry(2, 102);
    expect(getSnapshot().streamingChatIds).toEqual([1, 2]);
    finishStreamEntry(1);
    expect(getSnapshot().streamingChatIds).toEqual([2]);
  });

  it("restarting a chat's stream replaces its entry", () => {
    startStreamEntry(1, 101);
    startStreamEntry(1, 202);
    expect(getStreamingId(1)).toBe(202);
    expect(isChatBusy(1)).toBe(true);
    expect(getSnapshot().streamingChatIds).toEqual([1]);
  });
});
