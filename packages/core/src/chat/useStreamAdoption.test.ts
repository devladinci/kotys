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
        // Simulate the daemon: the stream this client claimed is still live.
        return liveOnDaemon.get(chatId) ?? null;
      },
    },
  }),
}));

const liveOnDaemon = new Map<number, number>();

const { claimLiveStream, releaseLiveStream, resetLiveStreams } =
  await import("./liveStreams.js");
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

  it("does nothing for a chat with no registry claim and no live stream", async () => {
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await act(async () => {});
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

  it("reports onNone when the daemon has nothing live for a viewer chat", async () => {
    const handlers = makeHandlers();
    renderHook(() => useStreamAdoption(7, handlers));
    await waitFor(() => expect(handlers.onNone).toHaveBeenCalledTimes(1));
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
});

describe("liveStreams registry", () => {
  it("candidate lookup is per-chat and release clears it", () => {
    claimLiveStream(1, 7);
    claimLiveStream(2, 8);
    expect(candidateLiveStream(7)).toBe(1);
    expect(candidateLiveStream(8)).toBe(2);
    releaseLiveStream(1);
    expect(candidateLiveStream(7)).toBeNull();
    expect(candidateLiveStream(8)).toBe(2);
  });
});
