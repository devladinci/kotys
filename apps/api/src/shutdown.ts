/**
 * Graceful shutdown for the API daemon.
 *
 * Before this module, SIGINT/SIGTERM hit Node's default behaviour: instant
 * exit. No server.close(), no WebSocket close, no WAL checkpoint, and — worst
 * of all — bash-tool children (spawned detached, in their own process group,
 * precisely so group signals don't reach them) were left running as orphans.
 * A terminal ^C therefore "shut down" the daemon while leaking everything it
 * was responsible for.
 *
 * The handler is intentionally best-effort with a hard deadline: a daemon that
 * cannot finish teardown in SHUTDOWN_TIMEOUT_MS still dies, it just dies
 * louder. Exit code 0 on a clean path, 1 on the deadline escape.
 */
import type { ServerType } from "@hono/node-server";
import { closeDatabase } from "@kotys/db";
import { killLiveBashChildren } from "./tools/bash.js";
import { disconnectMcpServers } from "./services/mcp.js";

const SHUTDOWN_TIMEOUT_MS = 5_000;

let httpServer: ServerType | null = null;
let shuttingDown = false;

/** Register the HTTP server so shutdown can stop accepting connections. */
export function registerHttpServer(server: ServerType): void {
  httpServer = server;
}

function log(msg: string): void {
  console.log(`[shutdown] ${msg}`);
}

async function teardown(reason: string, signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return; // a second signal must not re-enter
  shuttingDown = true;
  log(`${reason} (${signal}) — shutting down`);

  const deadline = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("graceful shutdown deadline exceeded")),
      SHUTDOWN_TIMEOUT_MS,
    ).unref();
  });

  const steps: Array<[string, () => Promise<void> | void]> = [
    [
      "server",
      () =>
        new Promise<void>((resolve) => {
          const srv = httpServer;
          if (!srv || !srv.listening) return resolve();
          // Stop accepting new work; open connections get a short grace
          // period via closeAllConnections below (absent on Http2Server —
          // guard rather than assume which server variant is bound).
          srv.close(() => resolve());
          setTimeout(() => {
            const connCloser = srv as { closeAllConnections?: () => void };
            connCloser.closeAllConnections?.();
          }, 500).unref();
        }),
    ],
    ["bash children", async () => killLiveBashChildren()],
    ["mcp servers", async () => disconnectMcpServers()],
    ["database", () => closeDatabase()],
  ];

  try {
    for (const [name, step] of steps) {
      await Promise.race([Promise.resolve().then(step), deadline]);
      log(`${name} closed`);
    }
    log("done");
    process.exit(0);
  } catch (err) {
    console.error("[shutdown] teardown failed or timed out:", err);
    process.exit(1);
  }
}

/**
 * Install SIGINT/SIGTERM handlers. Idempotent; returns a cleanup used by
 * tests. Signal handlers are registered unconditionally (no
 * `process.stdin.isTTY` gating) so dev, packaged, and headless runs behave
 * identically.
 */
export function installShutdownHandlers(): () => void {
  const onSignal = (signal: NodeJS.Signals) => {
    void teardown("received signal", signal);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return () => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  };
}

/**
 * Test hook: clear the one-shot guard so a mocked process.exit (tests can't
 * really exit) doesn't leave the module wedged in "already shutting down".
 * Mirrors resetFramesForTests in capture_screen.ts.
 */
export function resetShutdownStateForTests(): void {
  shuttingDown = false;
}
