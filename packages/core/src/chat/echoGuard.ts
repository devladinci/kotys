/**
 * While a stream runs for a chat, this client's own RPC writes echo back as
 * broadcasts; refetching them would clobber the live-streamed text. A short
 * grace period after the last clear covers in-flight echoes, and a guard
 * older than STALE_MS is treated as a lost stream (`chat:done` never
 * arrived) so it cannot suppress live sync forever.
 */
const GRACE_MS = 1000;
const STALE_MS = 10 * 60_000;

const state = {
  lastActivityAt: new Map<number, number>(),
  lastClearedAt: 0,
};

/** Mark a chat as streaming (null = all streams for this client ended). */
export function declareStreamActivity(chatId: number | null): void {
  if (chatId === null) {
    if (state.lastActivityAt.size > 0) {
      state.lastClearedAt = Date.now();
      state.lastActivityAt.clear();
    }
    return;
  }
  state.lastActivityAt.set(chatId, Date.now());
  state.lastClearedAt = 0;
}

/**
 * One chat's stream ended while others may still be running: guard only that
 * chat with the in-flight-echo grace period instead of releasing every chat.
 */
export function clearStreamActivity(chatId: number): void {
  if (!state.lastActivityAt.has(chatId)) return;
  state.lastActivityAt.delete(chatId);
  state.lastClearedAt = Date.now();
}

/** True when a `messages:changed` broadcast must not trigger a refetch. */
export function isEchoSuppressed(chatId: number, now = Date.now()): boolean {
  const last = state.lastActivityAt.get(chatId);
  if (last !== undefined) return now - last < STALE_MS;
  return now - state.lastClearedAt < GRACE_MS;
}

/** Reset to pristine — for tests only. */
export function resetEchoGuard(): void {
  state.lastActivityAt.clear();
  state.lastClearedAt = 0;
}
