/**
 * Module-level per-chat send queue. Messages typed while a chat's stream is
 * running park here and drain FIFO once that chat goes idle. Keyed by chatId
 * so a queued message survives switching to another chat (the old
 * component-local state dropped it on chat switch), and survives view
 * unmounts (the settings route). Reactive via useSyncExternalStore.
 */

export interface QueuedMessage {
  id: number;
  text: string;
  images: string[];
}

const EMPTY: QueuedMessage[] = [];
const queues = new Map<number, QueuedMessage[]>();
const listeners = new Set<() => void>();
let nextId = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

/** Park a message for `chatId`. */
export function enqueueQueued(
  chatId: number,
  text: string,
  images: string[],
): void {
  const queued: QueuedMessage = { id: ++nextId, text, images };
  queues.set(chatId, [...(queues.get(chatId) ?? []), queued]);
  emit();
}

/** Remove one queued message (user dismissed it). */
export function dequeueQueued(chatId: number, id: number): void {
  const queue = queues.get(chatId);
  if (!queue) return;
  const next = queue.filter((q) => q.id !== id);
  if (next.length === queue.length) return;
  if (next.length === 0) queues.delete(chatId);
  else queues.set(chatId, next);
  emit();
}

/**
 * Pop the head of `chatId`'s queue: keeps `rest` only if the head is still
 * `next.id` (guards a dequeue that raced the drain).
 */
export function drainQueued(
  chatId: number,
  next: QueuedMessage,
  rest: QueuedMessage[],
): void {
  const queue = queues.get(chatId);
  if (!queue || queue[0]?.id !== next.id) return;
  if (rest.length === 0) queues.delete(chatId);
  else queues.set(chatId, rest);
  emit();
}

/** Current queue for `chatId` — stable reference between mutations. */
export function getQueued(chatId: number): QueuedMessage[] {
  return queues.get(chatId) ?? EMPTY;
}

export function subscribeQueued(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reset to pristine — for tests only. */
export function resetQueued(): void {
  queues.clear();
  emit();
}
