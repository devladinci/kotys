import type { Hono } from "hono";
import { getOrCreateToken, requireAuth } from "./auth.js";
import { createPairingService } from "./pairing.js";

/**
 * POST /pairing/start — authenticated: minting a code is for the instance's
 * own app (its settings UI). POST /pairing/claim — deliberately open: the
 * joining machine has no token yet; the 4-digit code, the attempt budget and
 * the short TTL are the gate. The exchange itself rides the tailnet's
 * encrypted transport, same as the paste-a-connect-code flow.
 */
export function registerPairingRoute(app: Hono): void {
  const pairing = createPairingService({ getToken: getOrCreateToken });

  app.post("/pairing/start", requireAuth(), (c) => {
    const { code, expiresInSeconds } = pairing.start();
    return c.json({ code, expiresInSeconds });
  });

  app.post("/pairing/claim", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const result = pairing.claim(codeFromBody(body));
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ token: result.token });
  });
}

function codeFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}
