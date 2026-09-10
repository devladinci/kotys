import type { ModelRef } from "@kotys/contracts";
import { omlxConfig, omlxEnabled } from "../llm/registry.js";
import { createOpenAiCompatibleSttConnector } from "./openAiCompatibleSttConnector.js";
import type { SttConnector } from "./types.js";

export type { SttConnector } from "./types.js";

/**
 * Selected STT model. A bare value is a legacy oMLX name; new selections
 * carry the owning provider as "provider:model" so the resolver never
 * guesses (mirrors ModelRef's provider+model split).
 */
export const STT_MODEL_SETTING = "stt_model";

export const parseSttModelSetting = (value: string | null): ModelRef | null => {
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
export function resolveSttConnector(ref: ModelRef): SttConnector {
  if (ref.provider === "omlx") {
    if (!omlxEnabled()) {
      throw new Error("oMLX is disabled");
    }
    return createOpenAiCompatibleSttConnector(omlxConfig());
  }
  throw new Error(`Unknown speech-to-text provider: ${ref.provider}`);
}

export function listEnabledSttConnectors(): {
  provider: string;
  connector: SttConnector;
}[] {
  const out: { provider: string; connector: SttConnector }[] = [];
  if (omlxEnabled()) {
    out.push({
      provider: "omlx",
      connector: createOpenAiCompatibleSttConnector(omlxConfig()),
    });
  }
  return out;
}
