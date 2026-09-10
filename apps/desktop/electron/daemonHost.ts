/**
 * Pure helpers for choosing the daemon bind host. Extracted from daemon.ts
 * so the parsing rules are unit-testable without Electron.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const isDottedQuad = (s: string): boolean => {
  const m = IPV4.exec(s);
  return m !== null && m.slice(1).every((p) => Number(p) <= 255);
};

/**
 * First valid IPv4 in tailscale CLI output, or null. The CLI can exit
 * cleanly while printing an error to stdout, and error text past through
 * as a bind hostname crashes the daemon on DNS lookup.
 */
export function parseTailscaleIp(stdout: string): string | null {
  return (
    stdout
      .split("\n")
      .map((l) => l.trim())
      .find((l) => isDottedQuad(l)) ?? null
  );
}

/** A plausible bind target: IPv4 or a sane hostname (no spaces). */
export function plausibleHost(value: string): boolean {
  return IPV4.test(value) || /^[a-zA-Z0-9.-]+$/.test(value);
}
