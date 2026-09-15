import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearExpiredGenerating,
  generateTtlMs,
  isGenerating,
  generatingChatIdsSnapshot,
  markGenerating,
  markGeneratingDone,
  resetGenerating,
  subscribeGenerating,
} from "./generating.js";

describe("generating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetGenerating();
  });

  it("marks a chat generating on a progress pulse", () => {
    markGenerating(7, Date.now());
    expect(isGenerating(7)).toBe(true);
  });

  it("expires a chat after the TTL without a new pulse", () => {
    markGenerating(7, Date.now());
    vi.advanceTimersByTime(generateTtlMs() + 1000);
    expect(isGenerating(7)).toBe(false);
  });

  it("a fresh pulse extends the TTL", () => {
    markGenerating(7, Date.now());
    vi.advanceTimersByTime(generateTtlMs() - 1000);
    markGenerating(7, Date.now());
    vi.advanceTimersByTime(generateTtlMs() - 1000);
    expect(isGenerating(7)).toBe(true);
  });

  it("marks done instantly, ignoring the TTL", () => {
    markGenerating(7, Date.now());
    expect(isGenerating(7)).toBe(true);
    markGeneratingDone(7);
    expect(isGenerating(7)).toBe(false);
  });

  it("tracks two chats independently", () => {
    markGenerating(7, Date.now());
    markGenerating(9, Date.now());
    expect(isGenerating(7)).toBe(true);
    expect(isGenerating(9)).toBe(true);
    markGeneratingDone(7);
    expect(isGenerating(7)).toBe(false);
    expect(isGenerating(9)).toBe(true);
  });

  it("clearing a chat that never pulsed is a no-op", () => {
    expect(() => markGeneratingDone(42)).not.toThrow();
  });

  it("snapshot lists every generating chat id", () => {
    markGenerating(9, Date.now());
    markGenerating(7, Date.now());
    expect(generatingChatIdsSnapshot()).toEqual([9, 7]);
  });

  it("notifies subscribers only when the set of ids changes", () => {
    const listener = vi.fn();
    const off = subscribeGenerating(listener);
    markGenerating(7, Date.now());
    expect(listener).toHaveBeenCalledTimes(1);
    // Heartbeat refresh (same id) must not notify.
    markGenerating(7, Date.now() + 500);
    expect(listener).toHaveBeenCalledTimes(1);
    markGeneratingDone(7);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it("clearExpiredGenerating drops stale ids and emits once", () => {
    markGenerating(7, Date.now());
    markGenerating(9, Date.now());
    const listener = vi.fn();
    subscribeGenerating(listener);
    vi.advanceTimersByTime(generateTtlMs() + 1000);
    clearExpiredGenerating();
    expect(isGenerating(7)).toBe(false);
    expect(isGenerating(9)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});