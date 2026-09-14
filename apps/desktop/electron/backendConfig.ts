/**
 * Backend mode — the one setting that must be readable before any daemon
 * exists. The chat database can't hold it: in "connect" mode there may be no
 * local database at all, and the main process needs the decision before it
 * can decide whether to spawn the daemon that owns that database. So it
 * lives in backend.json beside the token file, written by the settings UI
 * over IPC.
 *
 * "own" is the default and matches historical behavior: this app spawns and
 * owns its daemon. "connect" attaches to a daemon already running on another
 * machine (e.g. over Tailscale) and shares that machine's database — it never
 * silently falls back to spawning locally; a failed connect is an error the
 * user resolves (retry / switch back to own), because silently becoming a
 * fresh instance would look like lost data.
 */

export type BackendMode =
  { kind: "own" } | { kind: "connect"; host: string; token: string };

export interface BackendConfig {
  mode: BackendMode;
}

export const OWN_BACKEND: BackendConfig = { mode: { kind: "own" } };

/**
 * Connect code handed over from the server machine's settings:
 * `<host>|<token>`. The separator can't appear in either half (hosts are
 * validated separately; tokens are opaque but whitespace-free), so a single
 * split is unambiguous.
 */
export function parseConnectCode(code: string): BackendMode | null {
  const sep = code.indexOf("|");
  if (sep <= 0) return null;
  const host = code.slice(0, sep).trim();
  const token = code.slice(sep + 1).trim();
  if (!host || !token) return null;
  if (!plausibleConnectHost(host)) return null;
  if (/\s/.test(token)) return null;
  return { kind: "connect", host, token };
}

export function encodeConnectCode(host: string, token: string): string {
  return `${host}|${token}`;
}

/** Same shape as daemonHost's plausibleHost: IPv4 or a sane hostname. */
function plausibleConnectHost(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^[a-zA-Z0-9.-]+$/.test(host);
}

/** Validate a mode read back from disk or IPC; anything else → own. */
export function isBackendMode(value: unknown): value is BackendMode {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "own") return true;
  if (v.kind === "connect") {
    return (
      typeof v.host === "string" &&
      v.host.length > 0 &&
      plausibleConnectHost(v.host) &&
      typeof v.token === "string" &&
      v.token.length > 0 &&
      !/\s/.test(v.token)
    );
  }
  return false;
}
