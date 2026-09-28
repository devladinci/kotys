import type { ModelRef } from "@kotys/contracts";
import { omlxConfig, omlxEnabled } from "../llm/registry.js";
import { createOpenAiCompatibleTtsConnector } from "./openAiCompatibleTtsConnector.js";
import type { TtsConnector } from "./types.js";

export type { TtsConnector } from "./types.js";

/**
 * Selected TTS model. A bare value is a legacy oMLX name; new selections
 * carry the owning provider as "provider:model" so the resolver never
 * guesses (mirrors the stt_model format).
 */
export const TTS_MODEL_SETTING = "tts_model";

export const parseTtsModelSetting = (value: string | null): ModelRef | null => {
  if (!value) return null;
  const sep = value.indexOf(":");
  if (sep > 0) {
    return { provider: value.slice(0, sep), model: value.slice(sep + 1) };
  }
  return { provider: "omlx", model: value };
};

/**
 * Connectors are stateless over their config, so they are built per call —
 * settings can change at runtime without restarts or cache invalidation.
 */
export function resolveTtsConnector(ref: ModelRef): TtsConnector {
  if (ref.provider === "omlx") {
    if (!omlxEnabled()) {
      throw new Error("oMLX is disabled");
    }
    return createOpenAiCompatibleTtsConnector(omlxConfig());
  }
  throw new Error(`Unknown text-to-speech provider: ${ref.provider}`);
}

export function listEnabledTtsConnectors(): {
  provider: string;
  connector: TtsConnector;
}[] {
  const out: { provider: string; connector: TtsConnector }[] = [];
  if (omlxEnabled()) {
    out.push({
      provider: "omlx",
      connector: createOpenAiCompatibleTtsConnector(omlxConfig()),
    });
  }
  return out;
}
