import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginStream,
  finishStream,
  isLive,
  liveForChat,
  resetStreams,
} from "./streams.js";

describe("stream registry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStreams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forgets a finished stream after the resume window", () => {
    beginStream(5, 1);
    finishStream(5);
    vi.advanceTimersByTime(10 * 60_000);
    expect(isLive(5)).toBe(false);
    expect(liveForChat(1)).toBeNull();
  });

  it("keeps a retry that reuses the id of a finished stream", () => {
    beginStream(5, 1);
    finishStream(5);
    vi.advanceTimersByTime(60_000);
    beginStream(5, 1);
    vi.advanceTimersByTime(10 * 60_000);
    expect(isLive(5)).toBe(true);
    expect(liveForChat(1)).toBe(5);
  });
});
