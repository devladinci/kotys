export const PORT = Number(process.env.KOTYS_PORT ?? 3017);

/**
 * Bind address. Defaults to loopback: the API is reachable from this machine
 * only unless you deliberately widen it.
 *
 * For phone access, prefer a Tailscale address over 0.0.0.0 — you get an
 * encrypted transport and a stable hostname without opening an inbound port on
 * your router.
 */
export const HOST = process.env.KOTYS_HOST ?? "127.0.0.1";

/** Origins allowed to call the API from a browser. Never "*". */
export const ALLOWED_ORIGINS = (
  process.env.KOTYS_ALLOWED_ORIGINS ??
  "http://localhost:5173,http://127.0.0.1:5173,app://kotys"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export { isOriginAllowed as isAllowedOrigin } from "./auth.js";
