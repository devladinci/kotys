import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { parseTailscaleIp, plausibleHost } from "./daemonHost";

const PORT = Number(process.env.KOTYS_PORT ?? 3017);
const BASE = `http://127.0.0.1:${PORT}`;
/**
 * KOTYS_REMOTE_HOST points this desktop app at a daemon already running on
 * another machine (e.g. the M1 over Tailscale: KOTYS_REMOTE_HOST=100.x.y.z).
 * The app then attaches instead of spawning a local daemon, so both machines
 * share one database. Loopback is still tried first, so a co-located daemon
 * always wins and "app + its own daemon" keeps working with the variable set.
 */
const REMOTE_HOST = process.env.KOTYS_REMOTE_HOST;

/**
 * Tailscale IPv4, or null when Tailscale is absent/down. Parsing rules are
 * in daemonHost.ts (unit-tested) — the CLI can exit cleanly while printing
 * an error to stdout.
 */
function tailscaleHost(): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const candidates =
      process.platform === "darwin"
        ? [
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
            "/opt/homebrew/bin/tailscale",
            "/usr/local/bin/tailscale",
          ]
        : ["tailscale"];
    for (const bin of candidates) {
      execFile(bin, ["ip", "-4"], { timeout: 3000 }, (err, stdout) => {
        if (!err && stdout) {
          const ip = parseTailscaleIp(stdout);
          if (ip) {
            finish(ip);
            return;
          }
        }
      });
    }
    setTimeout(() => finish(null), 3000);
  });
}

/**
 * Health-probe a remote host once. Used by ensureDaemon when
 * KOTYS_REMOTE_HOST points at another machine's daemon.
 */
async function probeRemote(host: string): Promise<string | null> {
  try {
    const res = await fetch(`http://${host}:${PORT}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok ? `http://${host}:${PORT}` : null;
  } catch {
    return null;
  }
}

function augmentPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const home = env.HOME ?? "";
  const extra = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    `${home}/.local/bin`,
    `${home}/.docker/bin`,
    `${home}/.bun/bin`,
    `${home}/.deno/bin`,
    `${home}/.volta/bin`,
    `${home}/.asdf/shims`,
  ];
  // Node version managers expose node/npx per version; pick the newest by
  // numeric version, since a string sort puts v10 above v9 but below v22.
  const byVersion = (a: string, b: string) => {
    const num = (v: string) => v.split(".").map((s) => Number(s) || 0);
    const [a1, a2, a3] = num(a);
    const [b1, b2, b3] = num(b);
    return a1 - b1 || a2 - b2 || a3 - b3;
  };
  const candidates: Array<[string, string]> = [
    [`${home}/.nvm/versions/node`, ""],
    [`${home}/.local/share/fnm/node-versions`, "/installation/bin"],
    [
      `${home}/Library/Application Support/fnm/node-versions`,
      "/installation/bin",
    ],
  ];
  for (const [base, suffix] of candidates) {
    try {
      const latest = readdirSync(base, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name.replace(/^v/, ""))
        .sort(byVersion)
        .at(-1);
      if (latest) extra.push(path.join(base, `v${latest}${suffix}`, "bin"));
    } catch {
      // version manager not installed
    }
  }
  const fnmDefault = `${home}/.local/share/fnm/aliases/default/bin`;
  try {
    if (readdirSync(fnmDefault).includes("node")) extra.push(fnmDefault);
  } catch {
    // fnm alias not present
  }
  const current = (env.PATH ?? "").split(path.delimiter);
  const seen = new Set<string>();
  const merged = [...extra, ...current].filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  return { ...env, PATH: merged.join(path.delimiter) };
}

let child: ChildProcess | null = null;

/**
 * A daemon bound to the Tailscale IP answers there, not on loopback — and
 * vice versa. Probe every candidate in parallel so attach-first never burns
 * two serial timeouts (up to a second) before deciding a daemon is gone.
 */
async function findRunningDaemon(host: string): Promise<string | null> {
  const candidates = [...new Set([BASE, `http://${host}:${PORT}`])];
  const probe = async (base: string): Promise<boolean> => {
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(500),
      });
      return res.ok;
    } catch {
      return false;
    }
  };
  const healthy = await Promise.all(candidates.map(probe));
  const idx = healthy.findIndex(Boolean);
  return idx === -1 ? null : candidates[idx];
}

/**
 * Attaches to an already-running daemon, or starts one.
 *
 * Attach-first matters: if you left the daemon up so your phone could reach it,
 * opening the desktop app must not start a second one fighting for the same
 * database and port.
 */
export async function ensureDaemon(): Promise<string> {
  // KOTYS_HOST wins, then Tailscale, then loopback; malformed values fall
  // through rather than dying on a DNS lookup.
  const envHost = process.env.KOTYS_HOST;
  const host =
    (envHost && plausibleHost(envHost) ? envHost : null) ??
    (await tailscaleHost()) ??
    "127.0.0.1";

  const running = await findRunningDaemon(host);
  const remote =
    REMOTE_HOST && plausibleHost(REMOTE_HOST) ? REMOTE_HOST : null;
  if (remote) {
    // Pointed at another machine: attach if its daemon is up, spawn one if
    // not (the local daemon will still bind host from KOTYS_HOST). Loopback
    // was probed first inside findRunningDaemon, so a co-located daemon
    // always wins over the remote one.
    const remoteBase = await probeRemote(remote);
    if (remoteBase) {
      console.log(
        `[api] attached to remote daemon at ${remoteBase} — not spawning our own`,
      );
      return remoteBase;
    }
    console.log(
      `[api] no daemon on ${remote}:${PORT} (KOTYS_REMOTE_HOST) — spawning locally`,
    );
  }
  if (running) {
    // Attach-first means this Electron process holds no daemon handle. Saying
    // so saves a future "why didn't ^C stop the API" mystery: the daemon the
    // terminal user sees belongs to someone else (production app, another
    // dev session) and was never ours to stop.
    console.log(
      `[api] attached to running daemon at ${running} — not spawning our own; ^C will not stop it`,
    );
    return running;
  }

  const entry = app.isPackaged
    ? path.join(app.getAppPath(), "dist-electron", "api-daemon.cjs")
    : path.join(app.getAppPath(), "..", "..", "apps", "api", "dist", "main.js");

  child = spawn(process.execPath, [entry], {
    env: augmentPath({
      ...process.env,
      KOTYS_PORT: String(PORT),
      KOTYS_HOST: host, // validated above
      ELECTRON_RUN_AS_NODE: "1",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => console.log(`[api] ${d}`));
  child.stderr?.on("data", (d) => console.error(`[api] ${d}`));
  if (host !== "127.0.0.1") console.log(`[api] bound to ${host} (tailscale)`);

  // Die fast on early exit (stderr tail included); otherwise wait out the
  // health timeout.
  let stderrTail = "";
  child.stderr?.on("data", (d) => {
    stderrTail = (stderrTail + d).slice(-2000);
  });
  const exited = new Promise<never>((_, reject) => {
    child?.on("exit", (code, signal) => {
      reject(
        new Error(
          `API daemon exited before becoming healthy (code=${code ?? "null"} signal=${signal ?? "null"})\n[api] ${stderrTail.trim() || "(no stderr)"}`,
        ),
      );
    });
  });

  const ready = (async () => {
    for (let i = 0; i < 40; i++) {
      const base = await findRunningDaemon(host);
      if (base) return base;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(
      `API daemon failed to start within 10s\n[api] ${stderrTail.trim() || "(no stderr)"}`,
    );
  })();

  try {
    return await Promise.race([ready, exited]);
  } catch (err) {
    // Don't leave a dangling child behind for retry/teardown to trip over.
    child?.kill();
    child = null;
    throw err;
  }
}

/**
 * Stop a daemon we spawned. Attach-only sessions are a no-op by design (see
 * ensureDaemon). Escalates SIGTERM → SIGKILL after a short grace period so a
 * wedged daemon cannot outlive the app holding the port.
 */
export async function stopDaemon(): Promise<void> {
  if (!child) return;
  const c = child;
  child = null;
  const exited = new Promise<void>((resolve) => {
    if (c.exitCode !== null || c.signalCode !== null) resolve();
    else c.once("exit", () => resolve());
  });
  c.kill("SIGTERM");
  const grace = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("daemon ignored SIGTERM")),
      SIGTERM_GRACE_MS,
    ).unref();
  });
  try {
    await Promise.race([exited, grace]);
  } catch {
    // Ignored SIGTERM — escalate. PID reuse in 2s is vanishingly unlikely,
    // and kill() on a dead PID is a harmless ESRCH.
    c.kill("SIGKILL");
    await exited;
  }
}

const SIGTERM_GRACE_MS = 2_000;
