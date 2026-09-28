import type { Hono } from "hono";
import { getSetting } from "@kotys/db";
import {
  parseTtsModelSetting,
  resolveTtsConnector,
  TTS_MODEL_SETTING,
} from "./services/tts/registry.js";
import { condenseForSpeech } from "./services/tts/condense.js";
import { requireAuth } from "./auth.js";

/** A spoken reply is a few sentences; anything bigger is abuse or a bug. */
const TTS_MAX_TEXT = 10_000;

/**
 * JSON in, WAV bytes out: oRPC is JSON-only, so TTS audio goes over a plain
 * route. The provider comes from the tts_model setting ("provider:model"),
 * never hardcoded — the route only orchestrates, connectors own the wire.
 */
export function registerTtsRoute(app: Hono): void {
  app.post("/tts/speech", requireAuth(), async (c) => {
    const ref = parseTtsModelSetting(getSetting(TTS_MODEL_SETTING));
    if (!ref) {
      return c.json({ error: "No text-to-speech model selected" }, 400);
    }
    const body = (await c.req.json().catch(() => null)) as {
      text?: unknown;
      voice?: unknown;
      language?: unknown;
      condense?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) {
      return c.json({ error: "Missing text" }, 400);
    }
    if (text.length > TTS_MAX_TEXT) {
      return c.json({ error: "Text is too long" }, 413);
    }
    const voice = typeof body?.voice === "string" ? body.voice : undefined;
    const language =
      typeof body?.language === "string" && body.language
        ? body.language
        : undefined;
    const condense = body?.condense !== false;

    try {
      const connector = resolveTtsConnector(ref);
      const spoken = condense ? await condenseForSpeech(text) : text;
      const audio = await connector.synthesize({
        model: ref.model,
        text: spoken,
        voice,
        language,
      });
      return new Response(audio, {
        headers: { "Content-Type": "audio/wav" },
      });
    } catch (err) {
      console.error("[tts] synthesis failed:", (err as Error).message);
      return c.json({ error: (err as Error).message }, 502);
    }
  });
}
