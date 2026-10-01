import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireAuth } from "./auth.js";
import {
  isWav,
  REFERENCE_MAX_BYTES,
  REFERENCE_TEXT_MAX_CHARS,
  saveReference,
} from "./services/tts/reference.js";
import { summarizeForSpeech } from "./services/tts/summary.js";

const FORM_OVERHEAD_BYTES = 64 * 1024;

const referenceTooLarge = (c: Context) =>
  c.json({ error: "The reference clip is too large" }, 413);

export function registerTtsRoute(app: Hono): void {
  app.post("/tts/summary", requireAuth(), async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      messageId?: unknown;
    } | null;
    const messageId = body?.messageId;
    if (typeof messageId !== "number" || !Number.isInteger(messageId)) {
      return c.json({ error: "Missing message" }, 400);
    }

    try {
      return c.json({ text: await summarizeForSpeech(messageId) });
    } catch (err) {
      console.error("[tts] summary failed:", (err as Error).message);

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
