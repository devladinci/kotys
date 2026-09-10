import { rpcMock } from "./rpc";

/**
 * Stands in for @kotys/client in every ui-web test. createRpcClient hands
 * back the shared rpcMock; KotysSocket is a no-op stub so stores can
 * subscribe without a live WebSocket.
 */
export function createRpcClient(): unknown {
  return rpcMock;
}

export class KotysSocket {
  on = () => () => {};
  send = () => true;
  connect = () => {};
  close = () => {};
}
