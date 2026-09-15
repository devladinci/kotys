/**
 * Module-level registry of streams this client started, keyed by requestId.
 * Component state dies with the chat view; this survives, so a remounted view
 * can re-adopt its own still-running stream (the daemon keeps streaming into
 * the chat regardless of what the client renders).
 */
const live = new Map<number, number>(); // requestId -> chatId

export function claimLiveStream(requestId: number, chatId: number): void {
  live.set(requestId, chatId);
}

export function releaseLiveStream(requestId: number): void {
  live.delete(requestId);
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

/** The chat a claimed stream belongs to (used on done/error cleanup). */
export function chatIdFor(requestId: number): number | null {
  return live.get(requestId) ?? null;
}

/** Reset to pristine — for tests only. */
export function resetLiveStreams(): void {
  live.clear();
}
