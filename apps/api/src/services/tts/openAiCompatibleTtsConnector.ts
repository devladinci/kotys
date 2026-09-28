import type { ModelListing } from "@kotys/contracts";
import type { TtsConnector } from "./types.js";

const MAX_AUDIO_TOKENS = 2048;
const BASE_AUDIO_TOKENS = 50;
const AUDIO_TOKENS_PER_CHAR = 5;

interface IConnectorConfig {
  baseUrl: string;
  apiKey: string;
  provider: string;
}

interface IModelStatus {
  id?: string;
  engine_type?: string;
  is_hidden?: boolean;
}

export const maxAudioTokens = (text: string): number =>
  Math.min(
    MAX_AUDIO_TOKENS,
    BASE_AUDIO_TOKENS + AUDIO_TOKENS_PER_CHAR * text.length,
  );

const isSpeechModel = (m: IModelStatus): m is IModelStatus & { id: string } =>
  typeof m.id === "string" &&
  m.is_hidden !== true &&
  m.engine_type === "audio_tts";

export function createOpenAiCompatibleTtsConnector({
  baseUrl,
  apiKey,
  provider,
}: IConnectorConfig): TtsConnector {
  const authHeaders = (): Record<string, string> =>
    apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  return {
    async listModels(): Promise<ModelListing[]> {
      const res = await fetch(`${baseUrl}/models/status`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`models/status failed: ${res.status}`);
      const body = (await res.json()) as { models?: IModelStatus[] };

      return (body.models ?? []).filter(isSpeechModel).map((m) => ({
        name: m.id,
        contextLength: null,
        capabilities: ["tts"],
        source: "local" as const,
        provider,
      }));
    },

    async synthesize({ model, text, refAudio, refText, signal }) {
      const reference =
        refAudio && refText ? { ref_audio: refAudio, ref_text: refText } : {};
      const res = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: text,
          response_format: "wav",
          max_tokens: maxAudioTokens(text),
          ...reference,
        }),
        signal,
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
