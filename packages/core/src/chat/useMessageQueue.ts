import { useCallback, useSyncExternalStore } from "react";
import {
  dequeueQueued,
  drainQueued,
  enqueueQueued,
  getQueued,
  subscribeQueued,
} from "./queueStore.js";

export type { QueuedMessage } from "./queueStore.js";
import type { QueuedMessage } from "./queueStore.js";

// A stable shared reference: useSyncExternalStore re-renders whenever two
// getSnapshot calls differ, so a fresh [] per call would loop forever.
const EMPTY: QueuedMessage[] = [];

export function useMessageQueue(activeChatId: number | null) {
  const queuedMessages = useSyncExternalStore(
    subscribeQueued,
    activeChatId === null ? () => EMPTY : () => getQueued(activeChatId),
    activeChatId === null ? () => EMPTY : () => getQueued(activeChatId),
  );

  const enqueue = useCallback(
    (text: string, images: string[]) => {
      if (activeChatId === null) return;
      enqueueQueued(activeChatId, text, images);
    },
    [activeChatId],
  );

  const dequeue = useCallback(
    (id: number) => {
      if (activeChatId === null) return;
      dequeueQueued(activeChatId, id);
    },
    [activeChatId],
  );

  const drain = useCallback(
    (next: QueuedMessage, rest: QueuedMessage[]) => {
      if (activeChatId === null) return;
      drainQueued(activeChatId, next, rest);
    },
    [activeChatId],
  );

  return { queuedMessages, enqueue, dequeue, drain };
}
