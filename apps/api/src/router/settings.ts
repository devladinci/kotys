import { z } from "zod";
import { getSetting, setSetting } from "@kotys/db";
import { pub } from "./base.js";

/**
 * Keys that may be written but never read back over the wire.
 *
 * The Ollama Cloud key lives in settings. Serving it to any caller that can
 * reach the port would make the API an exfiltration endpoint for the one
 * credential in the app. chatStream reads it server-side, where it's used.
 */
const SECRET_KEYS = new Set(["api_key", "api_token", "omlx_api_key"]);

export const settingsRouter = {
  get: pub.input(z.object({ key: z.string() })).handler(async ({ input }) => {
    if (SECRET_KEYS.has(input.key)) {
      return { value: null, secret: true as const };
    }
    return { value: getSetting(input.key), secret: false as const };
  }),

  set: pub
    .input(z.object({ key: z.string(), value: z.string() }))
    .handler(async ({ input }) => {
      setSetting(input.key, input.value);
      return { ok: true as const };
    }),

  /** Whether a secret is present, without revealing it. */
  hasSecret: pub
    .input(z.object({ key: z.string() }))
    .handler(async ({ input }) => ({
      present: Boolean(getSetting(input.key)),
    })),
};
