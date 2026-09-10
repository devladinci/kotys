import { useEffect } from "react";
import { useAppStore } from "./useAppStore.js";

export function useSettings() {
  const {
    apiKey,
    apiKeyPresent,
    omlxEnabled,
    omlxHost,
    omlxApiKeyPresent,
    defaultModel,
    hydrated,
    setApiKey,
    setOmlxEnabled,
    setOmlxHost,
    setOmlxApiKey,
    setDefaultModel,
    hydrate,
  } = useAppStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    apiKey,
    apiKeyPresent,
    omlxEnabled,
    omlxHost,
    omlxApiKeyPresent,
    defaultModel,
    hydrated,
    setApiKey,
    setOmlxEnabled,
    setOmlxHost,
    setOmlxApiKey,
    setDefaultModel,
  };
}
