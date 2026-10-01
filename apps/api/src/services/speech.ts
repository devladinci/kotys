import type { ModelListing, ModelRef } from "@kotys/contracts";
import { getSetting } from "@kotys/db";
import type { ISttEngineConfig, ITtsEngineConfig } from "@saystack/core";
import type { SpeechModelKind } from "@saystack/engine-openai-compatible";
import { listSpeechModels } from "@saystack/engine-openai-compatible";
import { omlxConfig, omlxEnabled } from "./llm/registry.js";

const STT_MODEL_SETTING = "stt_model";

const TTS_MODEL_SETTING = "tts_model";

const SETTING_FOR: Record<SpeechModelKind, string> = {
  stt: STT_MODEL_SETTING,
  tts: TTS_MODEL_SETTING,
};

/**
 * A speech model setting is "provider:model", mirroring ModelRef. A bare
 * value is a legacy oMLX name.
 */
const parseSpeechModelSetting = (value: string | null): ModelRef | null => {
  if (!value) return null;
  const sep = value.indexOf(":");
  if (sep > 0) {
    return { provider: value.slice(0, sep), model: value.slice(sep + 1) };
  }
  return { provider: "omlx", model: value };
};

const omlxServer = (): { url: string; token?: string } => {
  const { baseUrl, apiKey } = omlxConfig();
  return apiKey ? { url: baseUrl, token: apiKey } : { url: baseUrl };
};

/**
 * The engine saystack talks to for the selected model, or null when none is
 * usable (nothing selected, an unknown provider, or oMLX turned off).
 * Settings are read on every call, so changes apply without a restart.
 */
export function speechEngine(
  kind: SpeechModelKind,
): (ISttEngineConfig & ITtsEngineConfig) | null {
  const ref = parseSpeechModelSetting(getSetting(SETTING_FOR[kind]));
  if (ref?.provider !== "omlx" || !omlxEnabled()) return null;
  return { ...omlxServer(), model: ref.model };
}

/** The picker's list: every speech model of this kind the enabled providers offer. */
export async function listSpeechModelsOf(
  kind: SpeechModelKind,
): Promise<ModelListing[]> {
  if (!omlxEnabled()) return [];
  const listed = await listSpeechModels(omlxServer());
  if (!listed.ok) return [];
  return listed.models
    .filter((model) => model.kind === kind)
    .map((model) => ({
      name: model.id,
      contextLength: null,
      capabilities: [kind],
      source: "local" as const,
      provider: "omlx",
    }));
}
