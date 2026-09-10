import type { Hono } from "hono";
import { getSetting } from "@kotys/db";
import {
  parseSttModelSetting,
  resolveSttConnector,
  STT_MODEL_SETTING,
} from "./services/stt/registry.js";
import { requireAuth } from "./auth.js";

/** Voice notes are minutes long at most; anything bigger is abuse or a bug. */
const STT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Multipart upload: oRPC is JSON-only, so STT audio goes over a plain route.
 * The provider comes from the stt_model setting ("provider:model"), never
 * hardcoded — the route only orchestrates, connectors own the wire protocol.
 */
export function registerSttRoute(app: Hono): void {
  app.post("/stt/transcribe", requireAuth(), async (c) => {
    const ref = parseSttModelSetting(getSetting(STT_MODEL_SETTING));
    if (!ref) {
      return c.json({ error: "No speech-to-text model selected" }, 400);
    }
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "Missing audio file" }, 400);
    }
    if (file.size === 0) {
      return c.json({ error: "Recording was empty — try again" }, 400);
    }
    if (file.size > STT_MAX_BYTES) {
      return c.json({ error: "Recording is too large" }, 413);
    }
    const language = form.get("language");
    try {
      const connector = resolveSttConnector(ref);
      const result = await connector.transcribe({
        model: ref.model,
        file,
        filename: file.name || "audio",
        language:
          typeof language === "string" && language ? language : undefined,
      });
      return c.json({ text: result.text });
    } catch (err) {
      console.error("[stt] transcription failed:", (err as Error).message);
      // Pass the upstream detail through: connectors already trim it, and
      // "ffprobe failed" is meaningless without the provider's own message.
      return c.json({ error: (err as Error).message }, 502);
    }
  });
}
