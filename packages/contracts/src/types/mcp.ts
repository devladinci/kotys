export type McpServerStatus = "connected" | "disconnected" | "error";

export type McpServerInfo = {
  name: string;
  status: McpServerStatus;
  error?: string;
  tools: { name: string; description: string }[];
};
