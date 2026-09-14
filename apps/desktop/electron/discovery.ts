import { execFile } from "node:child_process";

/**
 * Discovery + pairing, client side. Extracted from daemon.ts so the rules
 * are unit-testable without Electron.
 *
 * Discovery asks `tailscale status --json` for peers and health-probes each
 * one's daemon; pairing trades the owner's short numeric code for its API
 * token via POST /pairing/claim.
 */

const TAILSCALE_STATUS_TIMEOUT_MS = 3000;
const HEALTH_TIMEOUT_MS = 1500;
const CLAIM_TIMEOUT_MS = 4000;

const CANDIDATE_BINS =
  process.platform === "darwin"
    ? [
        "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        "/opt/homebrew/bin/tailscale",
        "/usr/local/bin/tailscale",
      ]
    : ["tailscale"];

export interface DiscoveredInstance {
  /** Tailscale peer name or the IP when the name is unknown. */
  name: string;
  /** Tailscale IPv4 of the peer. */
  host: string;
}

export type DiscoverResult =
  | { status: "ok"; instances: DiscoveredInstance[] }
  | { status: "unavailable"; error: string };

interface TailscaleStatus {
  Peer?: Record<
    string,
    { HostName?: string; TailscaleIPs?: string[]; Online?: boolean }
  >;
}

export type PairClaim =
  { ok: true; token: string } | { ok: false; error: string };

/** Best-effort: no Tailscale (or no peers) is a normal empty answer. */
export function parsePeers(stdout: string): DiscoveredInstance[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const peers = (parsed as TailscaleStatus).Peer;
  if (!peers || typeof peers !== "object") return [];
  const out: DiscoveredInstance[] = [];
  for (const peer of Object.values(peers)) {
    if (!peer || peer.Online === false) continue;
    const ip = (peer.TailscaleIPs ?? []).find(isTailscaleIp);
    if (!ip) continue;
    const name = peer.HostName?.trim();
    out.push({ host: ip, name: name ? name.split(".")[0] : ip });
  }
  return out;
}

const isTailscaleIp = (value: string): boolean =>
  value.startsWith("100.") && isDottedQuad(value);

/** IPv4 with octets in range — reused by main.ts to guard pair requests. */
export const isDottedQuad = (value: string): boolean => {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
};

function runTailscale(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (stdout: string) => {
      if (!settled) {
        settled = true;
        resolve(stdout);
      }
    };
    for (const bin of CANDIDATE_BINS) {
      execFile(bin, args, { timeout: timeoutMs }, (err, stdout) => {
        if (!err && stdout) finish(stdout);
      });
    }
    setTimeout(() => finish(""), timeoutMs);
  });
}

/** List tailnet peers that answer a Kotys /health probe. */
export async function discoverInstances(port: number): Promise<DiscoverResult> {
  const stdout = await runTailscale(
    ["status", "--json"],
    TAILSCALE_STATUS_TIMEOUT_MS,
  );
  if (!stdout) {
    return {
      status: "unavailable",
      error: "Tailscale is not available on this machine.",
    };
  }
  const peers = parsePeers(stdout);
  const probed = await Promise.all(
    peers.map(async (peer) =>
      (await probeHealth(peer.host, port)) ? peer : null,
    ),
  );
  return {
    status: "ok",
    instances: probed.filter((p): p is DiscoveredInstance => p !== null),
  };
}

async function probeHealth(host: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Trade the owner's 4-digit code for its API token. 404 (no pairing in
 * progress) and 429 read as plain user-facing text; other shapes pass the
 * daemon's own message through.
 */
export async function claimPairing(
  host: string,
  port: number,
  code: string,
): Promise<PairClaim> {
  try {
    const res = await fetch(`http://${host}:${port}/pairing/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(CLAIM_TIMEOUT_MS),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const token = (body as { token?: unknown } | null)?.token;
      if (typeof token === "string" && token.length > 0) {
        return { ok: true, token };
      }
      return { ok: false, error: "malformed_pairing_response" };
    }
    const error =
      typeof (body as { error?: unknown } | null)?.error === "string"
        ? (body as { error: string }).error
        : `HTTP ${res.status}`;
    return { ok: false, error };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
