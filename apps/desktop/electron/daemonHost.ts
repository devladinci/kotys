/**
 * Pure helpers for choosing the daemon bind host. Extracted from daemon.ts
 * so the parsing rules are unit-testable without Electron.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Bind target: explicit KOTYS_HOST, else 0.0.0.0. The wide default is what
 * lets a paired phone reach the daemon from any network — LAN, foreign
 * Wi-Fi, cellular — instead of dying the moment it leaves the single
 * interface the daemon happens to be bound to. The bearer token is the
 * security boundary, not the bind address.
 */
export function resolveBindHost(envHost: string | undefined): string {
  if (envHost && plausibleHost(envHost)) return envHost;
  return "0.0.0.0";
}

/** A plausible bind target: IPv4 or a sane hostname (no spaces). `*` and
 * unbindable junk normalize to 0.0.0.0 — Node cannot bind to `*`, and if it
 * fell through the daemon would degrade to loopback while the API's origin
 * logic still applied the wide wildcard rule. */
export function plausibleHost(value: string): boolean {
  return (
    (IPV4.test(value) && value !== "0.0.0.0") ||
    (/^[a-zA-Z0-9.-]+$/.test(value) && value !== "*" && !hasUpper(value))
  );
}

/** Hostnames are matched case-insensitively downstream; reject oddities. */
function hasUpper(value: string): boolean {
  return /[A-Z]/.test(value);
}
