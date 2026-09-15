import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dequeueQueued,
  drainQueued,
  enqueueQueued,
  getQueued,
  resetQueued,
  subscribeQueued,
} from "./queueStore.js";

describe("queueStore", () => {
  beforeEach(() => {
    resetQueued();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts empty and returns a stable empty reference", () => {
    expect(getQueued(1)).toEqual([]);
    expect(getQueued(1)).toBe(getQueued(1));
  });

  it("keeps queues independent per chat", () => {
    enqueueQueued(1, "a", []);
    enqueueQueued(2, "b", []);
    expect(getQueued(1).map((q) => q.text)).toEqual(["a"]);
    expect(getQueued(2).map((q) => q.text)).toEqual(["b"]);
  });

  it("drains FIFO from the head only", () => {
    enqueueQueued(1, "a", []);
    enqueueQueued(1, "b", []);
    const queue = getQueued(1);
    drainQueued(1, queue[0], queue.slice(1));
    expect(getQueued(1).map((q) => q.text)).toEqual(["b"]);
    drainQueued(1, getQueued(1)[0], []);
    expect(getQueued(1)).toEqual([]);
  });

  it("drain is a no-op when the head changed (dequeued in between)", () => {
    enqueueQueued(1, "a", []);
    enqueueQueued(1, "b", []);
    const stale = getQueued(1);
    dequeueQueued(1, stale[0].id);
    drainQueued(1, stale[0], stale.slice(1));
    expect(getQueued(1).map((q) => q.text)).toEqual(["b"]);
  });

  it("notifies subscribers on every mutation", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeQueued(listener);
    expect(listener).not.toHaveBeenCalled();
    enqueueQueued(1, "a", []);
    expect(listener).toHaveBeenCalledTimes(1);
    drainQueued(1, getQueued(1)[0], []);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    enqueueQueued(1, "a", []);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
