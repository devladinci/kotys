/**
 * Module-level registry of chats that are currently generating, driven by the
 * daemon's 1-second `messages:progress` heartbeat (one pulse per live stream,
 * including long tool calls) — so one frame source covers both this client's
 * streams and a stream another client started. Entries are heartbeats with a
 * TTL, not state flips: a stalled or disconnected daemon lets the indicator
 * age out instead of spinning forever, and `chat:done`/`chat:error` clear the
 * chat instantly. Reactive via subscribeGenerating; consumers read it with
 * useSyncExternalStore. This is display state only — stream routing/busy
 * tracking stays in streamState.
 */

const TTL_MS = 6_000;

type Entry = { expiresAt: number };

const entries = new Map<number, Entry>();
const listeners = new Set<() => void>();

let snapshot: number[] = [];

function emit(): void {
  const next = [...entries.keys()];
  // Heartbeats mutate entries without changing the id set — subscribers
  // (useSyncExternalStore consumers) render from the id list only.
  if (
    next.length === snapshot.length &&
    next.every((id, i) => id === snapshot[i])
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function mark(chatId: number, expiresAt: number): void {
  const existing = entries.get(chatId);
  // A later expiry only ever extends — a stale heartbeat (out-of-order frame)
  // must not shorten a fresher entry.
  if (existing && existing.expiresAt >= expiresAt) return;
  entries.set(chatId, { expiresAt });
  emit();
}

export function markGenerating(chatId: number, nowMs: number): void {
  mark(chatId, nowMs + TTL_MS);
}

export function markGeneratingDone(chatId: number): void {
  if (!entries.has(chatId)) return;
  entries.delete(chatId);
  emit();
}

export function isGenerating(chatId: number): boolean {
  const entry = entries.get(chatId);
  return entry !== undefined && entry.expiresAt > Date.now();
}

export function generatingChatIdsSnapshot(): number[] {
  return snapshot;
}

export function subscribeGenerating(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Sweep stale ids and notify once if anything dropped. Without a sweep a
 * stalled stream (daemon gone, socket dead — no `chat:done`) would spin its
 * indicator forever: entries only leave the view when someone clears them.
 * The Sidebar and the mobile list call this on their clock intervals.
 */
export function clearExpiredGenerating(): void {
  const now = Date.now();
  let dropped = false;
  for (const [chatId, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(chatId);
      dropped = true;
    }
  }
  if (dropped) emit();
}

/** Time after the last pulse before a chat stops counting as generating. */
export function generateTtlMs(): number {
  return TTL_MS;
}

/** Reset to pristine — for tests only. */
export function resetGenerating(): void {
  entries.clear();
  snapshot = [];
  for (const listener of listeners) listener();
}
