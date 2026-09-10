import { z } from "zod";

const MCP_STDIO_SERVER_SCHEMA = z.object({
  type: z.literal("stdio").optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const MCP_HTTP_SERVER_SCHEMA = z.object({
  type: z.literal("http"),
  url: z.string().min(1),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  scope: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const MCP_SERVER_SCHEMA = z.union([
  MCP_STDIO_SERVER_SCHEMA,
  MCP_HTTP_SERVER_SCHEMA,
]);

export const MCP_SERVERS_SCHEMA = z.record(z.string(), MCP_SERVER_SCHEMA);

export type McpStdioServerConfig = z.infer<typeof MCP_STDIO_SERVER_SCHEMA>;
export type McpHttpServerConfig = z.infer<typeof MCP_HTTP_SERVER_SCHEMA>;
export type McpServerConfig = z.infer<typeof MCP_SERVER_SCHEMA>;
export type McpServersConfig = z.infer<typeof MCP_SERVERS_SCHEMA>;
