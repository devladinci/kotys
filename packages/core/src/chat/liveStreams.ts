/**
 * Module-level registry of streams this client started, keyed by requestId.
 * Component state dies with the chat view; this survives, so a remounted view
 * can re-adopt its own still-running stream (the daemon keeps streaming into
 * the chat regardless of what the client renders).
 */
const live = new Map<number, number>(); // requestId -> chatId

/** How long a stopped stream's late frames may keep arriving. */
const STOP_GRACE_MS = 10 * 60_000;
const stopped = new Map<number, number>(); // requestId -> forgetAt

function forgetExpired(nowMs: number): void {
  for (const [requestId, forgetAt] of stopped) {
    if (forgetAt > nowMs) continue;
    stopped.delete(requestId);
  }
}

export function claimLiveStream(requestId: number, chatId: number): void {
  live.set(requestId, chatId);
  stopped.delete(requestId);
}

export function releaseLiveStream(requestId: number): void {
  live.delete(requestId);
}

/**
 * Call when the user stops a stream: its late frames stay this client's. The
 * daemon deletes a finished stream after ten minutes (streams.ts); the same
 * grace bounds this memory, so a done frame lost to a socket drop cannot
 * poison the id forever — the row can be regenerated on another device.
 */
export function markStreamStopped(requestId: number): void {
  live.delete(requestId);
  stopped.set(requestId, Date.now() + STOP_GRACE_MS);
}

/** The daemon confirmed the stream ended: its frames are no longer late. */
export function forgetStreamStopped(requestId: number): void {
  stopped.delete(requestId);
}

export function candidateLiveStream(chatId: number): number | null {
  for (const [requestId, id] of live) {
    if (id === chatId) return requestId;
  }
  return null;
}

/** True when this client started the stream behind this requestId. */
export function hasLiveStream(requestId: number): boolean {
  return live.has(requestId);
}

/** True while the daemon may still emit late frames for a stopped stream. */
export function wasStreamStopped(requestId: number): boolean {
  forgetExpired(Date.now());
  return stopped.has(requestId);
}

/** The chat a claimed stream belongs to (used on done/error cleanup). */
export function chatIdFor(requestId: number): number | null {
  return live.get(requestId) ?? null;
}

/** Reset to pristine — for tests only. */
export function resetLiveStreams(): void {
  live.clear();
  stopped.clear();
}
