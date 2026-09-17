import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Context, Next } from "hono";
import { DB_PATH, getSetting, setSetting } from "@kotys/db";
import { ALLOWED_ORIGINS, HOST } from "./config.js";

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

/** Origin decision shared by CORS and originGuard. Non-HTTP(S) schemes
 * (exp://, app://) and the literal "null" can't come from a web page, so they
 * imply a native client the bearer token protects anyway. Same-host http(s)
 * covers the Expo dev server sharing the daemon's address. A wildcard bind
 * (0.0.0.0) matches no literal address, so any loopback/private/tailnet IP
 * dev-server origin is accepted — the token still guards the RPC surface. */
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "*"]);

function isPrivateishIp(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".ts.net")
  ) {
    return true;
  }
  const ipv4 = hostname.split(".").map(Number);
  if (
    ipv4.length !== 4 ||
    ipv4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return false;
  }
  const [a, b] = ipv4;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function isOriginAllowed(
  origin: string,
  allowlist: readonly string[] = ALLOWED_ORIGINS,
  bindHost: string = HOST,
): boolean {
  if (allowlist.includes(origin) || origin === "null") return true;
  if (/^(exp|app|file|capacitor):\/\//.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  if (/^https?:\/\//.test(origin)) {
    try {
      const { hostname } = new URL(origin);
      if (hostname === bindHost) return true;
      if (WILDCARD_HOSTS.has(bindHost) && isPrivateishIp(hostname)) return true;
    } catch {
      return false;
    }
  }
  return false;
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
