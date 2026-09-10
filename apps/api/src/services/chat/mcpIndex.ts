import type { McpIndexTier } from "../mcp.js";
import { getChatLoadedTools, rememberChatLoadedTools } from "@kotys/db";

export const mcpIndexTier = (ctx: number): McpIndexTier =>
  ctx >= 200_000 ? "full" : ctx >= 64_000 ? "brief" : "names";

export const withSystemBlocks = <T extends { role: string; content: string }>(
  messages: T[],
  ...blocks: string[]
): T[] => {
  const joined = blocks.filter((b) => b.trim()).join("\n\n");
  if (!joined) return messages;
  const at = messages.findIndex((m) => m.role === "system");
  if (at === -1) return [{ role: "system", content: joined } as T, ...messages];
  return messages.map((m, i) =>
    i === at ? { ...m, content: `${m.content}\n\n${joined}` } : m,
  );
};

export const rememberLoadedMcpTools = (
  chatId: number | null,
  names: string[],
): void => {
  if (chatId === null || names.length === 0) return;
  rememberChatLoadedTools(chatId, names);
};

export const getLoadedMcpToolNames = (chatId: number | null): string[] =>
  chatId === null ? [] : getChatLoadedTools(chatId);
