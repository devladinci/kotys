import { Hono } from "hono";
import { cors } from "hono/cors";
import os from "node:os";
import { serve, upgradeWebSocket } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { RPCHandler } from "@orpc/server/fetch";
import { initDatabase, DB_PATH } from "@kotys/db";
import { router } from "./router/index.js";
import { HOST, isAllowedOrigin, PORT } from "./config.js";
import { registerSttRoute } from "./sttRoute.js";
import { registerPairingRoute } from "./pairingRoute.js";
import {
  getOrCreateToken,
  isValidToken,
  originGuard,
  requireAuth,
  writeTokenFile,
} from "./auth.js";
import { bindEvents, onClose, onMessage, onOpen } from "./ws/manager.js";
import { connectMcpServers } from "./services/mcp.js";
import { recoverPomodoroSession } from "./services/pomodoro.js";
import { startReminderScheduler } from "./services/reminders.js";
import { initSkills } from "./services/skills/registry.js";
import { installShutdownHandlers, registerHttpServer } from "./shutdown.js";

initDatabase(DB_PATH);
const token = getOrCreateToken();
writeTokenFile(token);
bindEvents();
recoverPomodoroSession();
startReminderScheduler();
// Scan + fs.watch the skills roots; fire-and-forget like MCP connect.
void initSkills().catch((err) => {
  console.error("[skills] startup scan failed:", err);
});

// Fire-and-forget: keep listening while slow stdio servers boot.
void connectMcpServers({ skipOAuth: true }).catch((err) => {
  console.error("[mcp] startup connect failed:", err);
});

const app = new Hono();

// Preflight here, actual check in originGuard — the two must agree.
app.use(
  "*",
  cors({
    origin: (origin) => (isAllowedOrigin(origin) ? origin : ""),
    allowHeaders: ["Authorization", "Content-Type"],
    credentials: false,
  }),
);
app.use("*", originGuard());

/**
 * Instance name for pairing/discovery UIs. The Tailscale hostname is
 * unique and human-readable on a tailnet; fall back to the literal
 * hostname, then a generic label.
 */
function instanceName(): string {
  return process.env.KOTYS_INSTANCE_NAME ?? os.hostname().split(".")[0];
}

app.get("/health", (c) => c.json({ ok: true, name: instanceName() }));

registerPairingRoute(app);

app.use("/rpc/*", requireAuth());

registerSttRoute(app);

const handler = new RPCHandler(router);
app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: "/rpc",
    context: { clientId: null },
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

// Browsers can't set WS handshake headers; token rides in the query string.
app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const authed = isValidToken(c.req.query("token"));
    let clientId: string | null = null;
    return {
      onOpen(_event, ws) {
        if (!authed) {
          ws.close(4001, "unauthorized");
          return;
        }
        clientId = onOpen(ws);
      },
      onMessage(event, _ws) {
        if (!authed || !clientId) return;
        void onMessage(clientId, String(event.data));
      },
      onClose() {
        if (clientId) onClose(clientId);
      },
    };
  }),
);

const wss = new WebSocketServer({ noServer: true });

/**
 * Listen, degrading a failed non-loopback bind to loopback instead of
 * killing the daemon (Tailscale down, IP changed, hostname unresolvable).
 */
function listen(hostname: string, port: number): void {
  const server = serve(
    { fetch: app.fetch, hostname, port, websocket: { server: wss } },
    () => {
      console.log(`Kotys API  http://${hostname}:${port}`);
      console.log(`Database   ${DB_PATH}`);
      // Never print the token itself: it would end up in service logs.
      console.log(`Token file written next to the database`);
    },
  );
  registerHttpServer(server);
  server.on("error", (err: NodeJS.ErrnoException) => {
    const recoverable =
      hostname !== "127.0.0.1" &&
      ["ENOTFOUND", "EADDRNOTAVAIL", "EACCES", "EINVAL"].includes(
        err.code ?? "",
      );
    if (!recoverable) {
      console.error(`[api] listener error:`, err);
      process.exit(1);
    }
    // Detach before recursing — this server may still emit later errors.
    server.close();
    console.error(
      `[api] cannot bind ${hostname} (${err.code ?? err.message}) — falling back to 127.0.0.1`,
    );
    listen("127.0.0.1", port);
  });
}

listen(HOST, PORT);

installShutdownHandlers();
