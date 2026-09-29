import type { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { upgradeWebSocket } from "@hono/node-server";
import { getSetting } from "@kotys/db";
import {
  parseSttModelSetting,
  resolveSttConnector,
  STT_MODEL_SETTING,
} from "./services/stt/registry.js";
import type { SttStream } from "./services/stt/types.js";
import { isValidToken } from "./auth.js";

/** 16 kHz mono PCM16 is 32 KB a second: about the 13 minutes an upload may hold. */
const STREAM_MAX_BYTES = 25 * 1024 * 1024;

type ClientMessage = { type?: unknown; language?: unknown };

const readMessage = (raw: string): ClientMessage => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as ClientMessage)
      : {};
  } catch {
    return {};
  }
};

const reply = (ws: WSContext, message: Record<string, unknown>) => {
  ws.send(JSON.stringify(message));
};

const fail = (ws: WSContext, detail: string) => {
  reply(ws, { type: "error", detail });
  ws.close(1011, "stt stream failed");
};

function openStream(ws: WSContext, language: string | undefined) {
  const ref = parseSttModelSetting(getSetting(STT_MODEL_SETTING));
  if (!ref) {
    fail(ws, "No speech-to-text model selected");
    return null;
  }
  try {
    const connector = resolveSttConnector(ref);
    if (!connector.openStream) {
      fail(ws, "This speech-to-text provider cannot transcribe live");
      return null;
    }
    return connector.openStream(
      { model: ref.model, ...(language ? { language } : {}) },
      (event) => {
        if (event.type === "ready") {
          reply(ws, { type: "ready" });
        } else if (event.type === "delta") {
          reply(ws, { type: "transcript.delta", delta: event.text });
        } else if (event.type === "done") {
          reply(ws, { type: "transcript.done", text: event.text });
          ws.close(1000, "done");
        } else {
          console.error("[stt] live transcription failed:", event.message);
          fail(ws, event.message);
        }
      },
    );
  } catch (err) {
    fail(ws, (err as Error).message);
    return null;
  }
}

/**
 * Live dictation, speaking the realtime transcription protocol: the client
 * sends {"type":"start"}, binary 16 kHz mono PCM16, then {"type":"stop"}; the
 * daemon answers ready, transcript.delta, transcript.done or error. The
 * model comes from the stt_model setting, as for /stt/transcribe. Browsers
 * can't set WS handshake headers, so the token rides in the query string.
 */
export function registerSttStreamRoute(app: Hono): void {
  app.get(
    "/stt/stream",
    upgradeWebSocket((c) => {
      const authed = isValidToken(c.req.query("token"));
      let stream: SttStream | null = null;
      let received = 0;
      return {
        onOpen(_event, ws) {
          if (!authed) ws.close(4001, "unauthorized");
        },
        onMessage(event, ws) {
          if (!authed) return;
          if (typeof event.data === "string") {
            const message = readMessage(event.data);
            if (message.type === "start" && !stream) {
              const language =
                typeof message.language === "string"
                  ? message.language
                  : undefined;
              stream = openStream(ws, language);
            } else if (message.type === "stop") {
              stream?.stop();
            }
            return;
          }
          if (!stream || !(event.data instanceof ArrayBuffer)) return;
          received += event.data.byteLength;
          if (received > STREAM_MAX_BYTES) {
            fail(ws, "Recording is too long");
            return;
          }
          stream.send(new Uint8Array(event.data));
        },
        onClose() {
          stream?.close();
          stream = null;
        },
      };
    }),
  );
}
