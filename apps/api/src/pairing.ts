import { randomInt } from "node:crypto";

/**
 * Owner-side pairing: the instance that owns the data mints a short numeric
 * code; the joining instance trades that code for the real API token. The
 * code exists only while the owner's pairing panel holds a live session
 * (short TTL, one session at a time), and a session admits only a handful
 * of attempts before it dies — on a private tailnet the 4-digit space plus
 * that budget is comfortably out of brute-force reach.
 */

export interface PairingAttempt {
  ok: true;
  token: string;
}

export interface PairingFailure {
  ok: false;
  /** 404 no live session · 403 wrong code · 429 attempt budget spent. */
  status: 403 | 404 | 429;
  error: string;
}

export interface PairingService {
  /** Mint a fresh code, replacing any previous session. */
  start(): { code: string; expiresInSeconds: number };
  /** Trade a candidate code for the API token. */
  claim(candidate: string): PairingAttempt | PairingFailure;
}

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

export function createPairingService(options?: {
  getToken?: () => string;
  now?: () => number;
  ttlMs?: number;
  maxAttempts?: number;
}): PairingService {
  const getToken = options?.getToken ?? (() => "");
  const now = options?.now ?? Date.now;
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let current: { code: string; expiresAt: number; attempts: number } | null =
    null;
  // Codes of sessions that ended (replaced/expired/spent/claimed): claims
  // against them read as "no pairing in progress" and never burn the live
  // session's attempt budget.
  const stale = new Set<string>();

  return {
    start() {
      if (current) stale.add(current.code);
      const code = String(randomInt(0, 10000)).padStart(4, "0");
      current = { code, expiresAt: now() + ttlMs, attempts: 0 };
      return { code, expiresInSeconds: ttlMs / 1000 };
    },

    claim(candidate) {
      if (stale.has(candidate)) {
        return { ok: false, status: 404, error: "no_pairing_in_progress" };
      }
      if (!current || now() > current.expiresAt) {
        if (current) stale.add(current.code);
        current = null;
        return { ok: false, status: 404, error: "no_pairing_in_progress" };
      }
      if (current.attempts >= maxAttempts) {
        stale.add(current.code);
        current = null;
        return { ok: false, status: 429, error: "too_many_attempts" };
      }
      if (candidate !== current.code) {
        current.attempts += 1;
        return { ok: false, status: 403, error: "wrong_code" };
      }
      const token = getToken();
      stale.add(current.code);
      current = null;
      return { ok: true, token };
    },
  };
}
