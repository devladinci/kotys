const TTL_MS = 6_000;

type Entry = { expiresAt: number };

const entries = new Map<number, Entry>();
const listeners = new Set<() => void>();

let snapshot: number[] = [];

function emit(): void {
  const next = [...entries.keys()];
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
  // A stale heartbeat (out-of-order frame) must not shorten a fresher entry.
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

// Without a sweep a stalled stream (dead socket, no chat:done) spins forever.
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

export function generateTtlMs(): number {
  return TTL_MS;
}

/** Reset to pristine — for tests only. */
export function resetGenerating(): void {
  entries.clear();
  snapshot = [];
  for (const listener of listeners) listener();
}
