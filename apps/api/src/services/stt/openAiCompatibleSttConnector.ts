import type { ModelListing } from "@kotys/contracts";
import { WebSocket } from "ws";
import { isAudioModelName } from "../llm/openaiCompatibleConnector.js";
import type { SttConnector, SttStreamEvent } from "./types.js";

type RealtimeMessage = {
  type?: unknown;
  delta?: unknown;
  text?: unknown;
  detail?: unknown;
};

const readRealtimeMessage = (raw: string): RealtimeMessage => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as RealtimeMessage)
      : {};
  } catch {
    return {};
  }
};

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
    realtime_stt?: boolean;
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

    // Only /models/status says which models decode while audio arrives.
    async supportsStreaming(model) {
      const res = await fetch(`${baseUrl}/models/status`, {
        headers: headers(),
      }).catch(() => null);
      if (!res?.ok) return false;
      const body = (await res.json().catch(() => ({}))) as {
        models?: ModelStatus[];
      };
      return (
        body.models?.some((m) => m.id === model && m.realtime_stt === true) ??
        false
      );
    },

    openStream({ model, language }, onEvent) {
      const socket = new WebSocket(
        `${baseUrl.replace(/^http/, "ws")}/audio/transcriptions/realtime`,
      );
      let isOver = false;
      const report = (event: SttStreamEvent) => {
        if (isOver) return;
        if (event.type === "done" || event.type === "error") isOver = true;
        onEvent(event);
      };

      // A WebSocket handshake carries no Authorization header, so the key
      // goes in the start message.
      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            type: "start",
            model,
            api_key: apiKey,
            ...(language ? { language } : {}),
          }),
        );
      });
      socket.on("message", (data, isBinary) => {
        if (isBinary) return;
        const message = readRealtimeMessage(data.toString());
        if (message.type === "ready") {
          report({ type: "ready" });
        } else if (
          message.type === "transcript.delta" &&
          typeof message.delta === "string"
        ) {
          report({ type: "delta", text: message.delta });
        } else if (message.type === "transcript.done") {
          report({
            type: "done",
            text: typeof message.text === "string" ? message.text : "",
          });
        } else if (message.type === "error") {
          report({
            type: "error",
            message:
              typeof message.detail === "string"
                ? message.detail
                : "Live transcription failed",
          });
        }
      });
      socket.on("error", (err) => {
        report({
          type: "error",
          message: `live transcription failed: ${err.message}`,
        });
      });
      socket.on("close", () => {
        report({ type: "error", message: "The transcription stream ended" });
      });

      return {
        send: (pcm) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(pcm);
        },
        stop: () => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "stop" }));
          }
        },
        close: () => {
          isOver = true;
          socket.close();
        },
      };
    },

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
