import type { KotysConfig } from "./rpc.js";

/**
 * Single encapsulated place for "can this client reach the daemon?". Every
 * reachability check — pairing, retry screens, attach-or-start probes — goes
 * through here so timeout and error semantics stay identical.
 *
 * AbortSignal.timeout is unavailable in React Native's fetch; a manual
 * AbortController + setTimeout works everywhere.
 */
export async function probeHealth(
  baseUrl: string,
  timeoutMs = 5_000,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience for callers that just want a boolean or a thrown error. */
export async function requireDaemon(
  config: KotysConfig,
  timeoutMs = 5_000,
): Promise<void> {
  const ok = await probeHealth(config.baseUrl, timeoutMs);
  if (!ok) throw new Error(`Daemon unreachable at ${config.baseUrl}`);
}
