import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getSetting } from "@kotys/db";
import { requireAuth } from "./auth.js";
import {
  parseTtsModelSetting,
  resolveTtsConnector,
  TTS_MODEL_SETTING,
} from "./services/tts/registry.js";
import {
  isWav,
  loadReference,
  REFERENCE_MAX_BYTES,
  REFERENCE_TEXT_MAX_CHARS,
  saveReference,
} from "./services/tts/reference.js";

const TTS_MAX_TEXT = 2_000;
const FORM_OVERHEAD_BYTES = 64 * 1024;

const referenceTooLarge = (c: Context) =>
  c.json({ error: "The reference clip is too large" }, 413);

export function registerTtsRoute(app: Hono): void {
  app.post("/tts/speech", requireAuth(), async (c) => {
    const ref = parseTtsModelSetting(getSetting(TTS_MODEL_SETTING));
    if (!ref) {
      return c.json({ error: "No text-to-speech model selected" }, 400);
    }
    const body = (await c.req.json().catch(() => null)) as {
      text?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "Missing text" }, 400);
    if (text.length > TTS_MAX_TEXT) {
      return c.json({ error: "Text is too long" }, 413);
    }

    try {
      const connector = resolveTtsConnector(ref);
      const reference = await loadReference();
      const audio = await connector.synthesize({
        model: ref.model,
        text,
        refAudio: reference?.audio,
        refText: reference?.text,
        signal: c.req.raw.signal,
      });

      return new Response(audio, { headers: { "Content-Type": "audio/wav" } });
    } catch (err) {
      if (!c.req.raw.signal.aborted) {
        console.error("[tts] synthesis failed:", (err as Error).message);
      }

      return c.json({ error: (err as Error).message }, 502);
    }
  });

  app.post(
    "/tts/reference",
    requireAuth(),
    bodyLimit({
      maxSize: REFERENCE_MAX_BYTES + FORM_OVERHEAD_BYTES,
      onError: referenceTooLarge,
    }),
    async (c) => {
      const form = await c.req.formData().catch(() => null);
      const file = form?.get("file");
      const text = form?.get("text");
      if (!(file instanceof File)) {
        return c.json({ error: "Missing audio file" }, 400);
      }
      if (file.size > REFERENCE_MAX_BYTES) return referenceTooLarge(c);
      const transcript = typeof text === "string" ? text.trim() : "";
      if (!transcript) {
        return c.json({ error: "Add the words spoken in the clip" }, 400);
      }
      if (transcript.length > REFERENCE_TEXT_MAX_CHARS) {
        return c.json({ error: "The transcript is too long" }, 413);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isWav(bytes)) {
        return c.json({ error: "The reference clip must be a WAV file" }, 400);
      }
      await saveReference(bytes, transcript);

      return c.json({ ok: true });
    },
  );
}
