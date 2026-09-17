import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The live-stream registry is what lets a remounted chat view re-adopt a
 * stream the daemon is still running. Without it the send button comes back
 * as "send" while generation is in flight.
 */

const handlers = new Map<string, (msg: unknown) => void>();
const sent: unknown[] = [];

vi.mock("../shared/clients.js", () => ({
  getSocket: () => ({
    on: (cb: (msg: unknown) => void) => {
      handlers.set("on", cb);
    },
    send: (msg: unknown) => void sent.push(msg),
  }),
  getRpc: () => ({
    chats: {
      liveStream: async ({ chatId }: { chatId: number }) => {
        if (probeOnce.promise) {
          const p = probeOnce.promise;
          probeOnce.promise = null;
          return p;
        }
        if (probeFails.now) throw new Error("daemon unreachable");
        // Simulate the daemon: the stream this client claimed is still live.
        return liveOnDaemon.get(chatId) ?? null;
      },
    },
  }),
}));

const liveOnDaemon = new Map<number, number>();
/** Rejecting the probe simulates a daemon/network that is unreachable. */
const probeFails = { now: false };
/** When set, the next probe resolves with this promise (once). */
const probeOnce = { promise: null as Promise<number | null> | null };

const {
  claimLiveStream,
  releaseLiveStream,
  resetLiveStreams,
  markStreamStopped,
  wasStreamStopped,
} = await import("./liveStreams.js");
const { candidateLiveStream } = await import("./liveStreams.js");
const { useStreamAdoption } = await import("./useStreamAdoption.js");
const { renderHook, act, waitFor } = await import("@testing-library/react");

const makeHandlers = () => ({
  adopt: vi.fn(),
  onGone: vi.fn(),
  onForeign: vi.fn(),
  onForeignGone: vi.fn(),
  onNone: vi.fn(),
});

describe("useStreamAdoption", () => {
  beforeEach(() => {
    resetLiveStreams();
    liveOnDaemon.clear();
    probeFails.now = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adopts a stream the daemon reports as still live", async () => {
    claimLiveStream(42, 7);
    liveOnDaemon.set(7, 42);
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await waitFor(() => expect(handlers.adopt).toHaveBeenCalledWith(42));
    expect(handlers.onGone).not.toHaveBeenCalled();
    expect(handlers.onForeign).not.toHaveBeenCalled();
  });

  it("clears a stale claim when the daemon has no live stream", async () => {
    claimLiveStream(42, 7);
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await waitFor(() => expect(handlers.onGone).toHaveBeenCalledWith(42));
    expect(handlers.adopt).not.toHaveBeenCalled();
    expect(handlers.onNone).not.toHaveBeenCalled();
    // The stale claim must be gone: a later mount does not re-probe it.
    renderHook(() => useStreamAdoption(7, handlers));
    await waitFor(() => expect(handlers.adopt).not.toHaveBeenCalled());
    expect(handlers.onGone).toHaveBeenCalledTimes(1);
  });

  it("adopts on a live probe and clears when the stream ends in between", async () => {
    vi.useFakeTimers();
    claimLiveStream(42, 7);
    liveOnDaemon.set(7, 42);
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await act(async () => {}); // flush the initial probe
    expect(handlers.adopt).toHaveBeenCalledWith(42);
    liveOnDaemon.delete(7); // stream finished while the view was open
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(handlers.onGone).toHaveBeenCalledWith(42);
    expect(handlers.adopt).toHaveBeenCalledTimes(1);
  });

  it("reports onNone for a chat with no claim and no live stream", async () => {
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await waitFor(() => expect(handlers.onNone).toHaveBeenCalledTimes(1));
    expect(handlers.adopt).not.toHaveBeenCalled();
    expect(handlers.onGone).not.toHaveBeenCalled();
    expect(handlers.onForeign).not.toHaveBeenCalled();
  });

  it("adopts a foreign stream: daemon live, no local claim", async () => {
    liveOnDaemon.set(7, 42);
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await waitFor(() => expect(handlers.onForeign).toHaveBeenCalledWith(42));
    expect(handlers.adopt).not.toHaveBeenCalled();
  });

  it("clears a foreign-adopted stream when the daemon reports it gone", async () => {
    vi.useFakeTimers();
    liveOnDaemon.set(7, 42);
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await act(async () => {});
    expect(handlers.onForeign).toHaveBeenCalledWith(42);
    liveOnDaemon.delete(7);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(handlers.onForeignGone).toHaveBeenCalledWith(42);
    expect(handlers.onNone).not.toHaveBeenCalled();
  });

  it("does not recheck a foreign stream after the view unmounts", async () => {
    vi.useFakeTimers();
    liveOnDaemon.set(7, 42);
    const handlers = makeHandlers();
    const view = renderHook(() => useStreamAdoption(7, handlers));
    await act(async () => {});
    view.unmount();
    liveOnDaemon.delete(7);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(handlers.onForeignGone).not.toHaveBeenCalled();
  });

  it("a failed probe keeps the current state and retries", async () => {
    vi.useFakeTimers();
    liveOnDaemon.set(7, 42);
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await act(async () => {});
    expect(handlers.onForeign).toHaveBeenCalledWith(42);

    probeFails.now = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    // One failed request (phone locked mid-recheck) must not clear the state.
    expect(handlers.onForeignGone).not.toHaveBeenCalled();

    probeFails.now = false;
    liveOnDaemon.delete(7);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(handlers.onForeignGone).toHaveBeenCalledWith(42);
  });

  it("a send that claims mid-probe is left alone by a null answer", async () => {
    // The probe resolves after this client already started its own stream
    // (first send in a new chat, or a queue drain on mount).
    let resolveProbe: (id: number | null) => void = () => {};
    probeOnce.promise = new Promise((resolve) => {
      resolveProbe = resolve;
    });
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    // Simulate: send() claimed the chat while the probe was still in flight.
    claimLiveStream(9000, 7);
    await act(async () => {
      resolveProbe(null);
    });
    expect(handlers.onNone).not.toHaveBeenCalled();
    expect(handlers.onGone).not.toHaveBeenCalled();
  });
});

describe("liveStreams registry", () => {
  beforeEach(() => {
    resetLiveStreams();
  });

  it("candidate lookup is per-chat and release clears it", () => {
    claimLiveStream(1, 7);
    claimLiveStream(2, 8);
    expect(candidateLiveStream(7)).toBe(1);
    expect(candidateLiveStream(8)).toBe(2);
    releaseLiveStream(1);
    expect(candidateLiveStream(7)).toBeNull();
    expect(candidateLiveStream(8)).toBe(2);
  });

  it("a stopped stream's late-frame grace expires", () => {
    vi.useFakeTimers();
    markStreamStopped(42);
    expect(wasStreamStopped(42)).toBe(true);
    // The daemon forgets a finished stream after ten minutes; a done frame
    // lost to a socket drop must not poison the id beyond that.
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(wasStreamStopped(42)).toBe(false);
    vi.useRealTimers();
  });

  it("claiming a stopped row again clears the stop memory", () => {
    markStreamStopped(42);
    claimLiveStream(42, 7);
    expect(wasStreamStopped(42)).toBe(false);
  });
});
