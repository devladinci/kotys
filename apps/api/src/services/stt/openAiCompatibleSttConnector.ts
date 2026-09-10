import type { ModelListing } from "@kotys/contracts";
import { isAudioModelName } from "../llm/openaiCompatibleConnector.js";
import type { SttConnector } from "./types.js";

/**
 * OpenAI-compatible STT (oMLX today, any /v1 server with
 * /audio/transcriptions tomorrow). Listing prefers /models/status
 * (engine_type === "audio_stt"); servers without it fall back to /models
 * with the audio-name heuristic.
 */
export function createOpenAiCompatibleSttConnector(config: {
  baseUrl: string;
  apiKey: string;
  provider: string;
}): SttConnector {
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
          m.engine_type === "audio_stt",
      )
      .map((m) => ({
        name: m.id,
        contextLength: null,
        capabilities: ["stt"],
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
        capabilities: ["stt"],
        source: "local" as const,
        provider: config.provider,
      }));
  };

  return {
    listModels: () => listFromStatus().catch(() => listFromModels()),

    async transcribe({ model, file, filename, language }) {
      const form = new FormData();
      form.append("file", file, filename);
      form.append("model", model);
      if (language) form.append("language", language);

      const res = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: headers(),
        body: form,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `transcription failed: ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
        );
      }
      const body = (await res.json()) as {
        text?: string;
        language?: string | null;
        duration?: number | null;
      };
      return {
        text: body.text ?? "",
        language: body.language ?? null,
        duration: typeof body.duration === "number" ? body.duration : null,
      };
    },
  };
}
