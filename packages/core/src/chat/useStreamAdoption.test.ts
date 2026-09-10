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
    const adopt = vi.fn();
    const onGone = vi.fn();
    renderHook(() => useStreamAdoption(7, { adopt, onGone }));
    await waitFor(() => expect(adopt).toHaveBeenCalledWith(42));
    expect(onGone).not.toHaveBeenCalled();
  });

  it("clears a stale claim when the daemon has no live stream", async () => {
    claimLiveStream(42, 7);
    const adopt = vi.fn();
    const onGone = vi.fn();
    renderHook(() => useStreamAdoption(7, { adopt, onGone }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(42));
    expect(adopt).not.toHaveBeenCalled();
    // The stale claim must be gone: a later mount does not re-probe it.
    renderHook(() => useStreamAdoption(7, { adopt, onGone }));
    await waitFor(() => expect(adopt).not.toHaveBeenCalled());
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("adopts on a live probe and clears when the stream ends in between", async () => {
    vi.useFakeTimers();
    claimLiveStream(42, 7);
    liveOnDaemon.set(7, 42);
    const adopt = vi.fn();
    const onGone = vi.fn();
    renderHook(() => useStreamAdoption(7, { adopt, onGone }));
    await act(async () => {}); // flush the initial probe
    expect(adopt).toHaveBeenCalledWith(42);
    liveOnDaemon.delete(7); // stream finished while the view was open
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onGone).toHaveBeenCalledWith(42);
    expect(adopt).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a chat with no registry claim", async () => {
    const adopt = vi.fn();
    const onGone = vi.fn();
    renderHook(() => useStreamAdoption(7, { adopt, onGone }));
    await act(async () => {});
    expect(adopt).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
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
