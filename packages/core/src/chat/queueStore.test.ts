import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmSteer,
  dequeueQueued,
  drainQueued,
  enqueueQueued,
  getQueued,
  markSteering,
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
    expect(drainQueued(1, getQueued(1)[0].id)).toBe(true);
    expect(getQueued(1).map((q) => q.text)).toEqual(["b"]);
    expect(drainQueued(1, getQueued(1)[0].id)).toBe(true);
    expect(getQueued(1)).toEqual([]);
  });

  it("refuses to drain a message that is no longer the head", () => {
    enqueueQueued(1, "a", []);
    enqueueQueued(1, "b", []);
    const [a, b] = getQueued(1);
    dequeueQueued(1, a.id);
    expect(drainQueued(1, a.id)).toBe(false);
    expect(drainQueued(1, b.id)).toBe(true);
    expect(getQueued(1)).toEqual([]);
  });

  it("notifies subscribers on every mutation", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeQueued(listener);
    expect(listener).not.toHaveBeenCalled();
    enqueueQueued(1, "a", []);
    expect(listener).toHaveBeenCalledTimes(1);
    drainQueued(1, getQueued(1)[0].id);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    enqueueQueued(1, "a", []);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps a steered message queued until its receipt arrives", () => {
    enqueueQueued(1, "a", []);
    enqueueQueued(1, "b", []);
    const [a] = getQueued(1);
    markSteering(1, a.id, { requestId: 500, key: "k1" });

    expect(getQueued(1).map((q) => [q.text, q.steer?.key])).toEqual([
      ["a", "k1"],
      ["b", undefined],
    ]);

    confirmSteer("k1");
    expect(getQueued(1).map((q) => q.text)).toEqual(["b"]);
  });

  it("finds a receipt's message in whichever chat queued it", () => {
    enqueueQueued(1, "a", []);
    enqueueQueued(2, "b", []);
    markSteering(2, getQueued(2)[0].id, { requestId: 600, key: "k2" });
    confirmSteer("unknown");
    confirmSteer("k2");
    expect(getQueued(1).map((q) => q.text)).toEqual(["a"]);
    expect(getQueued(2)).toEqual([]);
  });

  it("ignores a mark for a message that already left the queue", () => {
    enqueueQueued(1, "a", []);
    const listener = vi.fn();
    const unsubscribe = subscribeQueued(listener);
    markSteering(1, 12345, { requestId: 500, key: "k1" });
    markSteering(3, 1, { requestId: 500, key: "k1" });
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(getQueued(1)[0].steer).toBeUndefined();
  });
});
