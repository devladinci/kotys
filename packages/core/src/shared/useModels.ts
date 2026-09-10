import { useEffect } from "react";
import { useAppStore } from "./useAppStore.js";
import { getRpc } from "./clients.js";
import { OLLAMA_CLOUD_HOST } from "@kotys/contracts";
import type { ModelListing } from "@kotys/contracts";

const MODELS_CACHE_KEY = "models_cache";

export function useModels() {
  const { apiKeyPresent, modelsCache, setModelsCache } = useAppStore();

  useEffect(() => {
    let cancelled = false;
    let completed = false;

    getRpc()
      .settings.get({ key: MODELS_CACHE_KEY })
      .then((result) => {
        if (cancelled || !result.value || completed) return;
        const parsed = (JSON.parse(result.value) as ModelListing[]).map((m) =>
          m.source
            ? m
            : { ...m, source: "cloud" as const, host: OLLAMA_CLOUD_HOST },
        );
        setModelsCache(parsed);
      });

    getRpc()
      .models.list()
      .then(async (models) => {
        if (cancelled) return;
        completed = true;
        await setModelsCache(models);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKeyPresent, setModelsCache]);

  return modelsCache;
}
