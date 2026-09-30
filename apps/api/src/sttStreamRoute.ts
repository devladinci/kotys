import type { Hono } from "hono";
import type { WSEvents } from "hono/ws";
import { upgradeWebSocket } from "@hono/node-server";
import { getSetting } from "@kotys/db";
import type { ISttRealtimeResult, ISttTranscribeResult } from "@saystack/core";
import { createRealtimeBridge } from "@saystack/server";
import {
  parseSttModelSetting,
  resolveSttConnector,
  STT_MODEL_SETTING,
} from "./services/stt/registry.js";
import { isValidToken } from "./auth.js";

const UNAUTHORIZED: WSEvents = {
  onOpen: (_event, ws) => ws.close(4001, "unauthorized"),
};

const refuse = (message: string): ISttRealtimeResult => ({
  ok: false,
  errorCode: "MODEL_NOT_FOUND",
  message,
});

function selectedConnector() {
  const ref = parseSttModelSetting(getSetting(STT_MODEL_SETTING));
  if (!ref) return null;
  try {
    return { model: ref.model, connector: resolveSttConnector(ref) };
  } catch {
    return null;
  }
}

async function openRealtime(language?: string): Promise<ISttRealtimeResult> {
  const selected = selectedConnector();
  if (!selected) return refuse("No speech-to-text model selected");
  const { model, connector } = selected;
  // Answer fast when the model can't stream, so the app transcribes the
  // recording instead of waiting on the engine to load and refuse.
  const canStream = (await connector.supportsStreaming?.(model)) === true;
  if (!canStream || !connector.openRealtime) {
    return refuse("The selected speech-to-text model cannot transcribe live");
  }
  return connector.openRealtime({ model, ...(language ? { language } : {}) });
}

async function transcribeAll(wav: Uint8Array): Promise<ISttTranscribeResult> {
  const selected = selectedConnector();
  if (!selected) {
    return {
      ok: false,
      errorCode: "NO_ADAPTER",
      message: "No speech-to-text model selected",
    };
  }
  try {
    const result = await selected.connector.transcribe({
      model: selected.model,
      file: new Blob([wav], { type: "audio/wav" }),
      filename: "audio.wav",
    });
    return { ok: true, text: result.text };
  } catch (err) {
    return {
      ok: false,
      errorCode: "TRANSCRIPTION_FAILED",
      message: (err as Error).message,
    };
  }
}

/**
 * Live dictation over the realtime transcription protocol. The model comes
 * from the stt_model setting, as for /stt/transcribe, and the last text
 * comes from one pass over the whole recording. Browsers can't set WS
 * handshake headers, so the token rides in the query string.
 */
export function registerSttStreamRoute(app: Hono): void {
  app.get(
    "/stt/stream",
    upgradeWebSocket((c) =>
      isValidToken(c.req.query("token"))
        ? createRealtimeBridge(({ language }) => openRealtime(language), {
            finalize: transcribeAll,
          })
        : UNAUTHORIZED,
    ),
  );
}
