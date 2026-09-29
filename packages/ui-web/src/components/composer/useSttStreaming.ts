import { useEffect, useState } from "react";
import { useAppStore, useRpc } from "@kotys/core";

/** Whether the selected speech-to-text model can stream into the draft. */
export function useSttStreaming(): boolean {
  const rpc = useRpc();
  const sttModel = useAppStore((s) => s.sttModel);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    rpc.stt.capabilities().then(
      ({ streaming }) => {
        if (!isCancelled) setIsStreaming(streaming);
      },
      () => {
        if (!isCancelled) setIsStreaming(false);
      },
    );

    return () => {
      isCancelled = true;
    };
  }, [rpc, sttModel]);

  return isStreaming;
}
