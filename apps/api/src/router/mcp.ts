import { getMcpServerInfo, reconnectMcpServers } from "../services/mcp.js";
import { pub } from "./base.js";

export const mcpRouter = {
  servers: pub.handler(async () => getMcpServerInfo()),

  reconnect: pub.handler(async () => {
    await reconnectMcpServers();
    return getMcpServerInfo();
  }),
};
