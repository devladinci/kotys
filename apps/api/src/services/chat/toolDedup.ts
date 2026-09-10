import type { ToolArgs } from "@kotys/contracts";

// Deterministic reads only — widgets and mutators are notably absent.
export const DEDUPED_TOOLS = new Set([
  "read_file",
  "list",
  "grep",
  "web_fetch",
  "web_search",
  "search_memories",
  "list_chats",
  "search_chats",
  "get_chat",
]);

export const TODO_TOOLS = new Set([
  "create_todo",
  "update_todo",
  "complete_todo",
  "delete_todo",
]);

// Model-emitted key order must not matter; objects sort recursively, array
// order is positional and preserved.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .map((k) => [k, canonical(record[k])]);
  }
  return value;
};

export const stableArgsKey = (args: ToolArgs): string =>
  JSON.stringify(canonical(args));
