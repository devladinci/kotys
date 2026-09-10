import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolActivity } from "@kotys/contracts";
import {
  StreamCollector,
  mergeChunks,
  mergeTools,
  type ToolDelta,
} from "./streamThrottle.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StreamCollector", () => {
  it("coalesces rapid adds into a single flush", () => {
    const flush = vi.fn();
    const c = new StreamCollector<number, string>(
      90,
      (existing, incoming) => (existing ?? "") + incoming,
      flush,
    );
    c.add(1, "a");
    c.add(1, "b");
    c.add(1, "c");
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(90);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(new Map([[1, "abc"]]));
  });

  it("keeps keys independent", () => {
    const flush = vi.fn();
    const c = new StreamCollector<number, string>(
      90,
      (existing, incoming) => (existing ?? "") + incoming,
      flush,
    );
    c.add(1, "a");
    c.add(2, "x");
    vi.advanceTimersByTime(90);
    expect(flush).toHaveBeenCalledTimes(1);
    const snap = flush.mock.calls[0][0] as Map<number, string>;
    expect(snap.get(1)).toBe("a");
    expect(snap.get(2)).toBe("x");
  });

  it("flushNow() emits pending deltas synchronously and cancels the timer", () => {
    const flush = vi.fn();
    const c = new StreamCollector<number, string>(
      90,
      (existing, incoming) => (existing ?? "") + incoming,
      flush,
    );
    c.add(7, "tail");
    c.flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(new Map([[7, "tail"]]));
    // The scheduled timer must not fire again.
    vi.advanceTimersByTime(500);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not flush when nothing is pending", () => {
    const flush = vi.fn();
    const c = new StreamCollector<number, string>(
      90,
      (existing, incoming) => (existing ?? "") + incoming,
      flush,
    );
    c.flushNow();
    vi.advanceTimersByTime(1000);
    expect(flush).not.toHaveBeenCalled();
  });

  it("discard drops a key without flushing it later", () => {
    const flush = vi.fn();
    const c = new StreamCollector<number, string>(
      90,
      (existing, incoming) => (existing ?? "") + incoming,
      flush,
    );
    c.add(1, "keep");
    c.add(2, "drop");
    c.discard(2);
    vi.advanceTimersByTime(90);
    expect(flush).toHaveBeenCalledTimes(1);
    const snap = flush.mock.calls[0][0] as Map<number, string>;
    expect(snap.size).toBe(1);
    expect(snap.has(2)).toBe(false);
  });

  it("dispose cancels the scheduled flush", () => {
    const flush = vi.fn();
    const c = new StreamCollector<number, string>(
      90,
      (existing, incoming) => (existing ?? "") + incoming,
      flush,
    );
    c.add(1, "x");
    c.dispose();
    vi.advanceTimersByTime(500);
    expect(flush).not.toHaveBeenCalled();
  });

  it("mergeChunks concatenates content and thinking separately", () => {
    expect(
      mergeChunks(
        { content: "a", thinking: "t1" },
        { content: "b", thinking: "t2" },
      ),
    ).toEqual({ content: "ab", thinking: "t1t2" });
    expect(mergeChunks(undefined, { content: "a", thinking: "" })).toEqual({
      content: "a",
      thinking: "",
    });
  });

  it("mergeTools accumulates activities in arrival order", () => {
    const mk = (i: number): ToolDelta => [i, { tool: `t${i}` } as ToolActivity];
    let state = mergeTools(undefined, [mk(0)]);
    state = mergeTools(state, [mk(2)]);
    expect(state).toHaveLength(2);
    expect(state[0][0]).toBe(0);
    expect(state[1][0]).toBe(2);
  });
});
