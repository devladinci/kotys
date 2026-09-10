import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  declareStreamActivity,
  isEchoSuppressed,
  resetEchoGuard,
} from "./echoGuard.js";

beforeEach(() => {
  vi.useFakeTimers();
  resetEchoGuard();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("echoGuard", () => {
  it("suppresses a guarded chat only", () => {
    declareStreamActivity(7);
    expect(isEchoSuppressed(7)).toBe(true);
    expect(isEchoSuppressed(8)).toBe(false);
  });

  it("clearing releases all chats after the grace period", () => {
    declareStreamActivity(1);
    declareStreamActivity(2);
    declareStreamActivity(null);
    expect(isEchoSuppressed(1, Date.now())).toBe(true);
    expect(isEchoSuppressed(2, Date.now())).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(isEchoSuppressed(1)).toBe(false);
    expect(isEchoSuppressed(2)).toBe(false);
  });

  it("grace period suppresses after clear, then expires", () => {
    declareStreamActivity(3);
    declareStreamActivity(null);
    const clearedAt = Date.now();
    expect(isEchoSuppressed(3, clearedAt + 999)).toBe(true);
    expect(isEchoSuppressed(3, clearedAt + 1001)).toBe(false);
  });

  it("declaring a new stream cancels the grace period", () => {
    declareStreamActivity(1);
    declareStreamActivity(null);
    declareStreamActivity(2);
    // The grace stamp no longer suppresses a refetch for an unguarded chat.
    expect(isEchoSuppressed(1)).toBe(false);
    expect(isEchoSuppressed(2)).toBe(true);
  });

  it("clearing an empty guard does not stamp a grace period", () => {
    declareStreamActivity(null);
    declareStreamActivity(null);
    expect(isEchoSuppressed(9)).toBe(false);
  });

  it("a lost stream cannot guard a chat forever", () => {
    declareStreamActivity(7);
    vi.advanceTimersByTime(10 * 60_000 + 1);
    // chat:done never arrived (socket died mid-stream), yet live sync for the
    // chat must recover — this is what unfreezes a reopened chat screen.
    expect(isEchoSuppressed(7)).toBe(false);
  });

  it("re-arm after grace lets sync resume", () => {
    declareStreamActivity(5);
    declareStreamActivity(null);
    vi.advanceTimersByTime(1001);
    expect(isEchoSuppressed(5)).toBe(false);
    declareStreamActivity(5);
    expect(isEchoSuppressed(5)).toBe(true);
    declareStreamActivity(null);
    vi.advanceTimersByTime(1001);
    expect(isEchoSuppressed(5)).toBe(false);
  });
});
