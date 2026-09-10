import type { RouterClient } from "@orpc/server";
import type { AppRouter, ClientMessage, ServerMessage } from "@kotys/api";
import type { KotysConfig } from "@kotys/client";
import { createRpcClient, KotysSocket } from "@kotys/client";

/**
 * Module-level singletons for code that runs outside React's render cycle
 * (Zustand stores, event subscribers). The provider sets these once at
 * startup; stores import the getters.
 */
let rpc: RouterClient<AppRouter> | null = null;
let socket: KotysSocket | null = null;
let config: KotysConfig | null = null;

export function setClients(cfg: KotysConfig): KotysSocket {
  config = cfg;
  rpc = createRpcClient(cfg);
  const s = new KotysSocket(cfg);
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
