import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Context, Next } from "hono";
import { DB_PATH, getSetting, setSetting } from "@kotys/db";
import { ALLOWED_ORIGINS } from "./config.js";

const TOKEN_KEY = "api_token";

function tokenFilePath(): string {
  return path.join(path.dirname(DB_PATH), "token");
}

export function writeTokenFile(token: string): void {
  writeFileSync(tokenFilePath(), `${token}\n`, { mode: 0o600 });
  chmodSync(tokenFilePath(), 0o600);
}

export function getOrCreateToken(): string {
  const existing = getSetting(TOKEN_KEY);
  if (existing) return existing;
  const token = randomBytes(32).toString("hex");
  setSetting(TOKEN_KEY, token);
  return token;
}

export function isValidToken(candidate: string | undefined | null): boolean {
  if (!candidate) return false;
  const expected = getOrCreateToken();
  if (candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Origin decision shared by CORS and originGuard: allowlist, or localhost on
 * any port. LAN/Tailscale browser access adds its origin to
 * KOTYS_ALLOWED_ORIGINS. */
export function isOriginAllowed(
  origin: string,
  allowlist: readonly string[] = ALLOWED_ORIGINS,
): boolean {
  if (allowlist.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

/**
 * DNS-rebinding defence: a rebound page's origin matches neither allowlist
 * nor localhost. No-Origin requests (curl, native) pass — the bearer token
 * protects those.
 */
export function originGuard() {
  return async (c: Context, next: Next) => {
    const origin = c.req.header("Origin");
    if (origin && !isOriginAllowed(origin)) {
      console.warn(`[auth] rejected origin: ${origin}`);
      return c.json({ error: "origin_not_allowed" }, 403);
    }
    await next();
  };
}

export function requireAuth() {
  return async (c: Context, next: Next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!isValidToken(token)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
