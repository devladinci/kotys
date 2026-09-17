import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
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

interface LocalIdentity {
  /** Canonical addresses (no zone index, no brackets). */
  addresses: readonly string[];
  /** Hostnames that refer to this machine: hostname(+.local), MagicDNS. */
  names: readonly string[];
}

const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "*"]);

const LOOPBACK_V6 = "0000:0000:0000:0000:0000:0000:0000:0001";
const UNSPECIFIED_V6 = "0000:0000:0000:0000:0000:0000:0000:0000";

const hex4 = (n: number): string => n.toString(16).padStart(4, "0");

function canonicalV4(input: string): string | null {
  const parts = input.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => n > 255)) return null;
  return nums.join(".");
}

/** Expand an IPv6 literal to eight zero-padded hex groups (handles "::"). */
function canonicalV6(input: string): string | null {
  const [head, tail, extra] = input.split("::");
  if (extra !== undefined) return null;
  const parse = (side: string): string[] | null => {
    if (side === "") return [];
    const out: string[] = [];
    for (const piece of side.split(":")) {
      if (piece.includes(".")) {
        // Embedded IPv4 tail, e.g. "::ffff:192.168.0.1".
        const v4 = canonicalV4(piece);
        if (!v4) return null;
        const [a, b, c, d] = v4.split(".").map(Number);
        out.push(hex4((a << 8) | b), hex4((c << 8) | d));
      } else if (/^[0-9a-f]{1,4}$/i.test(piece)) {
        out.push(hex4(Number.parseInt(piece, 16)));
      } else {
        return null;
      }
    }
    return out;
  };
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  if (!left || !right) return null;
  if (tail === undefined) return left.length === 8 ? left.join(":") : null;
  const zeros = 8 - left.length - right.length;
  if (zeros < 1) return null;
  return [
    ...left,
    ...Array.from({ length: zeros }, () => "0000"),
    ...right,
  ].join(":");
}

function canonicalHost(host: string): string | null {
  return host.includes(":") ? canonicalV6(host) : canonicalV4(host);
}

/** Lowercase, strip brackets/zone index/trailing dots so forms can compare. */
function normalizeHost(raw: string): string {
  let host = raw.toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    host = end === -1 ? host.slice(1) : host.slice(1, end);
  }
  const zone = host.indexOf("%");
  if (zone !== -1) host = host.slice(0, zone);
  while (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

/**
 * Origin decision shared by CORS and originGuard. Non-HTTP(S) schemes
 * (exp://, app://) and the literal "null" can't come from a web page, so they
 * imply a native client the bearer token protects anyway.
 *
 * For http(s) origins: loopback is always this machine's own browser. A
 * wildcard bind (0.0.0.0 — the desktop default) means "any of this machine's
 * addresses", so the origin host must be one of the Mac's own addresses
 * (LAN, tailnet, IPv6) or one of its own names (hostname(.local), MagicDNS,
 * Expo dev tunnels). Other devices on the network — a café router, a
 * neighboring laptop — and public hostnames (including Tailscale Funnel
 * pages on *.ts.net) stay rejected. On a specific bind only that exact host
 * matches; anything else needs KOTYS_ALLOWED_ORIGINS. The bearer token, not
 * this check, is the security boundary.
 */
export function isOriginAllowed(
  origin: string,
  allowlist: readonly string[] = ALLOWED_ORIGINS,
  bindHost: string = HOST,
  identity?: LocalIdentity,
): boolean {
  if (allowlist.includes(origin) || origin === "null") return true;
  if (/^(exp|app|file|capacitor):\/\//.test(origin)) return true;
  if (!/^https?:\/\//.test(origin)) return false;
  let host: string;
  try {
    host = normalizeHost(new URL(origin).hostname);
  } catch {
    return false;
  }
  // Loopback origins are always local — any port, or none.
  const canon = canonicalHost(host);
  if (
    host === "localhost" ||
    (canon !== null &&
      (canon.startsWith("127.") ||
        canon === LOOPBACK_V6 ||
        canon === UNSPECIFIED_V6))
  ) {
    return true;
  }
  const bind = normalizeHost(bindHost);
  if (canon !== null ? canon === canonicalHost(bind) : host === bind) {
    return true;
  }
  if (!WILDCARD_HOSTS.has(bind)) return false;
  const own = identity ?? localIdentity();
  if (
    canon !== null &&
    own.addresses.some((a) => canonicalHost(normalizeHost(a)) === canon)
  ) {
    return true;
  }
  if (
    canon === null &&
    (own.names.includes(host) ||
      host === "exp.direct" ||
      host.endsWith(".exp.direct"))
  ) {
    return true;
  }
  return false;
}

let cachedIdentity: LocalIdentity | null = null;

function computeLocalIdentity(): LocalIdentity {
  const addresses = new Set<string>();
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      const canon = canonicalHost(normalizeHost(net.address));
      if (canon !== null) addresses.add(canon);
    }
  }
  const names = new Set<string>();
  const host = hostname().toLowerCase();
  names.add(host);
  if (host.endsWith(".local")) names.add(host.slice(0, -".local".length));
  else names.add(`${host}.local`);
  try {
    // MagicDNS name for this node (trailing dot stripped); its first label is
    // the short form peers can use. Absent CLI/no tailnet is fine.
    const out = execFileSync("tailscale", ["status", "--json"], {
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const dnsName = (
      JSON.parse(out.toString()) as { Self?: { DNSName?: string } }
    ).Self?.DNSName;
    if (dnsName) {
      const name = dnsName.toLowerCase().replace(/\.+$/, "");
      names.add(name);
      names.add(name.split(".")[0] ?? name);
    }
  } catch {
    // No tailscale CLI — hostname-based names still apply.
  }
  return { addresses: [...addresses], names: [...names] };
}

export function localIdentity(): LocalIdentity {
  if (cachedIdentity === null) cachedIdentity = computeLocalIdentity();
  return cachedIdentity;
}

/**
 * DNS-rebinding defence: a rebound page's origin matches neither allowlist,
 * nor loopback, nor one of this machine's own addresses. No-Origin requests
 * (curl, native) pass — the bearer token protects those.
 */
export function originGuard(identity?: LocalIdentity) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header("Origin");
    if (origin && !isOriginAllowed(origin, ALLOWED_ORIGINS, HOST, identity)) {
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
