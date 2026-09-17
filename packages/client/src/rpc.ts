import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "@kotys/api";

export type KotysConfig = {
  /** e.g. "http://127.0.0.1:3017" or "http://your-mac.tailnet.ts.net:3017" */
  baseUrl: string;
  token: string;
};

export type SocketOptions = {
  /**
   * Only streams this client started are resumable. A watching client that
   * replays another device's chunks appends them to text the HTTP refetch
   * already brought in, duplicating it — so foreign frames are not tracked.
   */
  ownsStream?: (requestId: number) => boolean;
};

/**
 * Config is injected, never read from the environment inside this package.
 *
 * This matters more than it looks: Metro does not implement the Vite env
 * globals, so a package that reads them directly breaks React Native at the
 * first import. Each app supplies its own — Vite env for web, process.env for
 * desktop, Expo config for mobile.
 */
export function createRpcClient(config: KotysConfig): RouterClient<AppRouter> {
  const link = new RPCLink({
    url: `${config.baseUrl}/rpc`,
    headers: () => ({ Authorization: `Bearer ${config.token}` }),
  });
  return createORPCClient(link);
}
