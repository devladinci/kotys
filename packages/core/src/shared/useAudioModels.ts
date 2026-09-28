import { useEffect, useState } from "react";
import type { ModelListing } from "@kotys/contracts";
import { useRpc } from "./provider.js";

interface IAudioModels {
  models: ModelListing[] | null;
  loadError: string | null;
}

export function useAudioModels(kind: "stt" | "tts"): IAudioModels {
  const rpc = useRpc();
  const [models, setModels] = useState<ModelListing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    rpc[kind].models().then(
      (list) => {
        if (!isCancelled) setModels(list);
      },
      (err: Error) => {
        if (!isCancelled) setLoadError(err.message);
      },
    );

    return () => {
      isCancelled = true;
    };
  }, [rpc, kind]);

  return { models, loadError };
}
