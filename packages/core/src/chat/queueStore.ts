// Module-level and keyed by chatId, so a queued message outlives chat
// switches and view unmounts.

export interface QueuedMessage {
  id: number;
  text: string;
  // What a steer injects: the typed text with any skill already expanded.
  content: string;
  images: string[];
  /** Queued until the receipt; if the turn ends first, the drain sends it. */
  steer?: { requestId: number; key: string };
}

const EMPTY: QueuedMessage[] = [];
const queues = new Map<number, QueuedMessage[]>();
const listeners = new Set<() => void>();
let nextId = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

export function enqueueQueued(
  chatId: number,
  text: string,
  images: string[],
  content = text,
): void {
  const queued: QueuedMessage = { id: ++nextId, text, content, images };
  queues.set(chatId, [...(queues.get(chatId) ?? []), queued]);
  emit();
}

export function dequeueQueued(chatId: number, id: number): void {
  const queue = queues.get(chatId);
  if (!queue) return;
  const next = queue.filter((q) => q.id !== id);
  if (next.length === queue.length) return;
  if (next.length === 0) queues.delete(chatId);
  else queues.set(chatId, next);
  emit();
}

export function markSteering(
  chatId: number,
  id: number,
  steer: NonNullable<QueuedMessage["steer"]>,
): void {
  const queue = queues.get(chatId);
  if (!queue?.some((q) => q.id === id)) return;
  const next = queue.map((q) => (q.id === id ? { ...q, steer } : q));
  queues.set(chatId, next);
  emit();
}

export function confirmSteer(key: string): void {
  for (const [chatId, queue] of queues) {
    const hit = queue.find((q) => q.steer?.key === key);
    if (!hit) continue;
    dequeueQueued(chatId, hit.id);
    return;
  }
}

/**
 * Takes the head for sending. False when it is no longer the head — dequeued
 * meanwhile, or already taken — and the caller must not send it.
 */
export function drainQueued(chatId: number, id: number): boolean {
  const queue = queues.get(chatId);
  if (!queue || queue[0]?.id !== id) return false;
  const rest = queue.slice(1);
  if (rest.length === 0) queues.delete(chatId);
  else queues.set(chatId, rest);
  emit();
  return true;
}

export function getQueued(chatId: number): QueuedMessage[] {
  return queues.get(chatId) ?? EMPTY;
}

export function subscribeQueued(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function resetQueued(): void {
  queues.clear();
  emit();
}
