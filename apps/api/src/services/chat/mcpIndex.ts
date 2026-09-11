import type { McpIndexTier } from "../mcp.js";
import type { ToolDefinition } from "@kotys/contracts";
import {
  getChatLoadedTools,
  forgetChatLoadedTools,
  rememberChatLoadedTools,
} from "@kotys/db";

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

const defChars = (def: ToolDefinition) =>
  JSON.stringify(def.function.description).length +
  JSON.stringify(def.function.parameters).length;

export const LOADED_MCP_TOKEN_BUDGET = 3_000;

export function budgetLoadedMcpDefs(
  chatId: number | null,
  resolveDefs: (names: string[]) => ToolDefinition[],
): { defs: ToolDefinition[]; dropped: string[] } {
  const names = getLoadedMcpToolNames(chatId);
  if (chatId === null || names.length === 0) return { defs: [], dropped: [] };

  const named = resolveDefs(names);
  const byName = new Map(named.map((d) => [d.function.name, d]));
  const ordered = names
    .filter((n) => byName.has(n))
    .map((n) => byName.get(n) as ToolDefinition);

  let budget = LOADED_MCP_TOKEN_BUDGET * 4;
  const defs: ToolDefinition[] = [];
  const dropped: string[] = [];
  for (const def of [...ordered].reverse()) {
    const size = defChars(def);
    if (budget - size >= 0 || defs.length === 0) {
      budget -= size;
      defs.push(def);
    } else {
      dropped.push(def.function.name);
    }
  }
  defs.reverse();

  if (dropped.length > 0) forgetChatLoadedTools(chatId, dropped);
  return { defs, dropped };
}
