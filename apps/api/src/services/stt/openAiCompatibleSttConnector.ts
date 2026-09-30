import type { ModelListing } from "@kotys/contracts";
import { createOmlxRealtimeSttAdapter } from "@saystack/engine-openai-compatible";
import { isAudioModelName } from "../llm/openaiCompatibleConnector.js";
import type { SttConnector } from "./types.js";

/**
 * OpenAI-compatible STT (oMLX today, any /v1 server with
 * /audio/transcriptions tomorrow). Listing prefers /models/status
 * (engine_type === "audio_stt"); servers without it fall back to /models
 * with the audio-name heuristic.
 *
 * The status listing sits under /v1 even when the host does not (oMLX 404s
 * /models/status), so both forms are probed.
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
    realtime_stt?: boolean;
  };

  const statusUrls = (): string[] => {
    const base = baseUrl.replace(/\/+$/, "");
    const urls = [`${base}/models/status`];

    if (!/\/v1$/.test(base)) {
      urls.push(`${base}/v1/models/status`);
    }

    return urls;
  };

  const readStatus = async (): Promise<ModelStatus[] | null> => {
    for (const url of statusUrls()) {
      const res = await fetch(url, { headers: headers() }).catch(() => null);

      if (!res?.ok) {
        continue;
      }

      const body = (await res.json().catch(() => null)) as {
        models?: ModelStatus[];
      } | null;

      if (body !== null) {
        return body.models ?? [];
      }
    }

    return null;
  };

  const listFromStatus = async (): Promise<ModelListing[]> => {
    const status = await readStatus();

    if (status === null) {
      throw new Error("models/status is unavailable");
    }

    return status
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

    // Only /models/status says which models decode while audio arrives.
    async supportsStreaming(model) {
      const status = await readStatus();

      return (
        status?.some((m) => m.id === model && m.realtime_stt === true) ?? false
      );
    },

    openRealtime: ({ model, language }) =>
      createOmlxRealtimeSttAdapter({
        url: baseUrl,
        token: apiKey,
      }).openRealtime({ model, ...(language ? { language } : {}) }),

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
