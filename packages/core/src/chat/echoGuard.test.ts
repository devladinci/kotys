import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  declareStreamActivity,
  clearStreamActivity,
  isEchoSuppressed,
  resetEchoGuard,
} from "./echoGuard.js";

beforeEach(() => {
  vi.useFakeTimers();
  resetEchoGuard();
});

describe("echoGuard per-chat clear", () => {
  it("clearing one chat keeps the other guarded", () => {
    declareStreamActivity(1);
    declareStreamActivity(2);
    clearStreamActivity(1);
    expect(isEchoSuppressed(2)).toBe(true);
    expect(isEchoSuppressed(1)).toBe(true);
  });

  it("cleared chat resumes sync after the grace period", () => {
    declareStreamActivity(1);
    declareStreamActivity(2);
    const at = Date.now();
    clearStreamActivity(1);
    expect(isEchoSuppressed(1, at + 999)).toBe(true);
    expect(isEchoSuppressed(1, at + 1001)).toBe(false);
    // The other chat stays guarded well past that grace window.
    expect(isEchoSuppressed(2, at + 10_000)).toBe(true);
  });

  it("clearing an unguarded chat does not stamp a grace period", () => {
    clearStreamActivity(9);
    expect(isEchoSuppressed(9)).toBe(false);
  });

  it("stale guards expire per chat", () => {
    declareStreamActivity(1);
    declareStreamActivity(2);
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(isEchoSuppressed(1)).toBe(false);
    expect(isEchoSuppressed(2)).toBe(false);
  });
});

describe("echoGuard legacy clear-all", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEchoGuard();
  });

  it("null still releases every chat after the grace period", () => {
    declareStreamActivity(1);
    declareStreamActivity(2);
    declareStreamActivity(null);
    expect(isEchoSuppressed(1, Date.now())).toBe(true);
    expect(isEchoSuppressed(2, Date.now())).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(isEchoSuppressed(1)).toBe(false);
    expect(isEchoSuppressed(2)).toBe(false);
  });

  it("suppresses a guarded chat only", () => {
    declareStreamActivity(7);
    expect(isEchoSuppressed(7)).toBe(true);
    expect(isEchoSuppressed(8)).toBe(false);
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
