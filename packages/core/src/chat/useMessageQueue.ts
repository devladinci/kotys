import { useCallback, useEffect, useRef, useState } from "react";

export type QueuedMessage = {
  id: number;
  text: string;
  images: string[];
};

export function useMessageQueue(activeChatId: number | null) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queuedIdRef = useRef(0);

  const enqueue = useCallback((text: string, images: string[]) => {
    const queued = { id: ++queuedIdRef.current, text, images };
    setQueuedMessages((prev) => [...prev, queued]);
  }, []);

  const dequeue = useCallback((id: number) => {
    setQueuedMessages((prev) => prev.filter((q) => q.id !== id));
  }, []);

  useEffect(() => {
    setQueuedMessages([]); // eslint-disable-line react-hooks/set-state-in-effect -- reset on chat switch
    queuedIdRef.current = 0;
  }, [activeChatId]);

  const drain = useCallback((next: QueuedMessage, rest: QueuedMessage[]) => {
    setQueuedMessages((prev) => (prev[0]?.id === next.id ? rest : prev));
  }, []);

  return { queuedMessages, enqueue, dequeue, drain, queuedIdRef };
}
