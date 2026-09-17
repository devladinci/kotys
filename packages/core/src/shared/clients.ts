import type { RouterClient } from "@orpc/server";
import type { AppRouter, ClientMessage, ServerMessage } from "@kotys/api";
import type { KotysConfig } from "@kotys/client";
import { createRpcClient, KotysSocket } from "@kotys/client";
import { hasLiveStream } from "../chat/liveStreams.js";

/**
 * Module-level singletons for code that runs outside React's render cycle
 * (Zustand stores, event subscribers). The provider sets these once at
 * startup; stores import the getters.
 */
let rpc: RouterClient<AppRouter> | null = null;
let socket: KotysSocket | null = null;
let config: KotysConfig | null = null;

const sameConfig = (a: KotysConfig, b: KotysConfig): boolean =>
  a.baseUrl === b.baseUrl && a.token === b.token;

export function setClients(cfg: KotysConfig): KotysSocket {
  // Called again for the same daemon (StrictMode renders the provider's
  // initialiser twice), the existing socket stands: a second one would stay
  // connected with nothing closing it, and getSocket() would hand out the
  // newer one while the app held the older.
  if (socket && config && sameConfig(config, cfg)) return socket;
  socket?.close();
  config = cfg;
  rpc = createRpcClient(cfg);
  const s = new KotysSocket(cfg, {
    // Only streams this client started are resumable; watching another
    // device's stream would duplicate its chunks over the HTTP refetch.
    ownsStream: (requestId) => hasLiveStream(requestId),
  });
  s.connect();
  socket = s;
  return s;
}

export function getConfig(): KotysConfig {
  if (!config)
    throw new Error("Core not initialised — call setClients() first");
  return config;
}

export function getRpc(): RouterClient<AppRouter> {
  if (!rpc) throw new Error("Core not initialised — call setClients() first");
  return rpc;
}

export function getSocket(): KotysSocket {
  if (!socket)
    throw new Error("Core not initialised — call setClients() first");
  return socket;
}

/**
 * True when the daemon rejected the token (HTTP 401). The oRPC client wraps
 * the plain hono body in an ORPCError with code UNAUTHORIZED; duck-typing the
 * code keeps a runtime dependency on @orpc/client out of core.
 */
export function isUnauthorizedError(error: unknown): boolean {
  const e = error as { code?: unknown; status?: unknown } | null;
  return e?.code === "UNAUTHORIZED" || e?.status === 401;
}

export type { ClientMessage, ServerMessage };
