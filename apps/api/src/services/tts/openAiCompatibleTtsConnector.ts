import type { ModelListing } from "@kotys/contracts";
import { isAudioModelName } from "../llm/openaiCompatibleConnector.js";
import type { TtsConnector } from "./types.js";

/**
 * OpenAI-compatible TTS (oMLX today, any /v1 server with /audio/speech
 * tomorrow). Listing prefers /models/status (engine_type === "audio_tts");
 * servers without it fall back to /models with the audio-name heuristic.
 */
export function createOpenAiCompatibleTtsConnector(config: {
  baseUrl: string;
  apiKey: string;
  provider: string;
}): TtsConnector {
  const { baseUrl, apiKey } = config;

  const headers = (): Record<string, string> =>
    apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  type ModelStatus = {
    id?: string;
    engine_type?: string;
    is_hidden?: boolean;
  };

  const listFromStatus = async (): Promise<ModelListing[]> => {
    const res = await fetch(`${baseUrl}/models/status`, { headers: headers() });
    if (!res.ok) throw new Error(`models/status failed: ${res.status}`);
    const body = (await res.json()) as { models?: ModelStatus[] };
    return (body.models ?? [])
      .filter(
        (m): m is ModelStatus & { id: string } =>
          typeof m.id === "string" &&
          m.is_hidden !== true &&
          m.engine_type === "audio_tts",
      )
      .map((m) => ({
        name: m.id,
        contextLength: null,
        capabilities: ["tts"],
        source: "local" as const,
        provider: config.provider,
      }));
  };

  const listFromModels = async (): Promise<ModelListing[]> => {
    const res = await fetch(`${baseUrl}/models`, { headers: headers() });
    if (!res.ok) throw new Error(`/models failed: ${res.status}`);
    const body = (await res.json()) as { data?: { id?: string }[] };
    return (body.data ?? [])
      .filter(
        (m): m is { id: string } =>
          typeof m.id === "string" && isAudioModelName(m.id),
      )
      .map((m) => ({
        name: m.id,
        contextLength: null,
        capabilities: ["tts"],
        source: "local" as const,
        provider: config.provider,
      }));
  };

  return {
    listModels: () => listFromStatus().catch(() => listFromModels()),

    async synthesize({ model, text, voice }) {
      const res = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: text, voice }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `speech failed: ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
        );
      }
      return res.arrayBuffer();
    },
  };
}
