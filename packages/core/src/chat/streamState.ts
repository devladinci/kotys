export interface StreamStateSnapshot {
  streamingChatIds: number[];
}

type Entry = {
  busy: boolean;
  /** Assistant message id this chat's stream is writing into. */
  streamingId: number | null;
};

const entries = new Map<number, Entry>();
const listeners = new Set<() => void>();

let snapshot: StreamStateSnapshot = { streamingChatIds: [] };

function emit(): void {
  const next = [...entries.keys()];
  if (
    next.length === snapshot.streamingChatIds.length &&
    next.every((id, i) => id === snapshot.streamingChatIds[i])
  ) {
    return;
  }
  snapshot = { streamingChatIds: next };
  for (const listener of listeners) listener();
}

function entryFor(chatId: number): Entry {
  let entry = entries.get(chatId);
  if (!entry) {
    entry = { busy: false, streamingId: null };
    entries.set(chatId, entry);
  }
  return entry;
}

function mutate(chatId: number, patch: Partial<Entry>): void {
  const entry = entryFor(chatId);
  const busyChanged = patch.busy !== undefined && patch.busy !== entry.busy;
  const streamChanged =
    patch.streamingId !== undefined && patch.streamingId !== entry.streamingId;
  if (!busyChanged && !streamChanged) return;
  if (busyChanged && patch.busy !== undefined) entry.busy = patch.busy;
  if (streamChanged && patch.streamingId !== undefined) {
    entry.streamingId = patch.streamingId;
  }
  emit();
}

export function startStreamEntry(chatId: number, streamingId: number): void {
  mutate(chatId, { busy: true, streamingId });
}

export function finishStreamEntry(chatId: number): void {
  if (!entries.has(chatId)) return;
  entries.delete(chatId);
  emit();
}

// Unbusy without dropping a live streaming entry the daemon still owns.
export function clearChatBusy(chatId: number): void {
  const entry = entries.get(chatId);
  if (!entry) return;
  mutate(chatId, { busy: false });
}

export function isChatBusy(chatId: number): boolean {
  return entries.get(chatId)?.busy ?? false;
}

export function getStreamingId(chatId: number): number | null {
  return entries.get(chatId)?.streamingId ?? null;
}

export function isStreaming(chatId: number): boolean {
  return entries.has(chatId);
}

export function subscribeStreaming(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): StreamStateSnapshot {
  return snapshot;
}

/** Reset to pristine — for tests only. */
export function resetStreamState(): void {
  entries.clear();
  snapshot = { streamingChatIds: [] };
  for (const listener of listeners) listener();
}
