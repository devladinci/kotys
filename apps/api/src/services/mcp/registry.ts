import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  MCP_SERVERS_SCHEMA,
  type McpServersConfig,
  type ToolDefinition,
  type ToolCategory,
} from "@kotys/contracts";
import { getSetting } from "@kotys/db";

type ServerStatus = "connected" | "disconnected" | "error";

export type ManagedServer = {
  name: string;
  client: Client;
  tools: Tool[];
  status: ServerStatus;
  error?: string;
  close: () => Promise<void>;
};

export const servers = new Map<string, ManagedServer>();

export function parseConfig(): McpServersConfig {
  const raw = getSetting("mcp_servers");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return MCP_SERVERS_SCHEMA.parse(parsed);
  } catch (err) {
    console.error("[mcp] invalid mcp_servers config:", err);
    return {};
  }
}

function toCategory(tool: Tool): ToolCategory | undefined {
  const ann = tool.annotations;
  if (ann?.destructiveHint) return "write";
  if (ann?.readOnlyHint) return "read";
  return undefined;
}

export function toDefinition(serverName: string, tool: Tool): ToolDefinition {
  return {
    type: "function",
    category: toCategory(tool),
    function: {
      name: tool.name,
      description:
        tool.description ?? `MCP tool ${tool.name} from ${serverName}`,
      parameters: (tool.inputSchema as object) ?? {
        type: "object",
        properties: {},
      },
    },
  };
}

export function findServerForTool(name: string): ManagedServer | undefined {
  for (const s of servers.values()) {
    if (s.tools.some((t) => t.name === name)) return s;
  }
  return undefined;
}
