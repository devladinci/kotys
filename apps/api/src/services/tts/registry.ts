import type { ModelRef } from "@kotys/contracts";
import { omlxConfig, omlxEnabled } from "../llm/registry.js";
import { createOpenAiCompatibleTtsConnector } from "./openAiCompatibleTtsConnector.js";
import type { TtsConnector } from "./types.js";

export const TTS_MODEL_SETTING = "tts_model";

export const parseTtsModelSetting = (value: string | null): ModelRef | null => {
  if (!value) return null;
  const sep = value.indexOf(":");
  if (sep > 0) {
    return { provider: value.slice(0, sep), model: value.slice(sep + 1) };
  }

  return { provider: "omlx", model: value };
};

export function resolveTtsConnector(ref: ModelRef): TtsConnector {
  if (ref.provider !== "omlx") {
    throw new Error(`Unknown text-to-speech provider: ${ref.provider}`);
  }
  if (!omlxEnabled()) throw new Error("oMLX is disabled");

  return createOpenAiCompatibleTtsConnector(omlxConfig());
}

export function listEnabledTtsConnectors(): {
  provider: string;
  connector: TtsConnector;
}[] {
  if (!omlxEnabled()) return [];

  return [
    {
      provider: "omlx",
      connector: createOpenAiCompatibleTtsConnector(omlxConfig()),
    },
  ];
}
