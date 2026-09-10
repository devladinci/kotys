import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import { deleteMemory } from "@kotys/db";
import type { ToolContext } from "./types.js";

export const definition: ToolDefinition = {
  type: "function",
  category: "memory",
  function: {
    name: "delete_memory",
    description:
      "Permanently remove a memory. Use it when the user asks you to forget something, or when a memory turned out to be wrong. If a fact merely changed, call update_memory instead — deleting loses the history of what was known.",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "number",
          description: "Id of the memory to remove.",
        },
      },
    },
  },
};

export async function execute(
  args: ToolArgs,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const id = Number(args.id);
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("id must be a memory id");

  const memory = deleteMemory(id);
  if (!memory) {
    return {
      content: JSON.stringify({
        deleted: false,
        reason: `No memory with id ${id}. Call search_memories to find the right id.`,
      }),
      activity: { query: String(id) },
    };
  }

  return {
    content: JSON.stringify({
      deleted: true,
      memory: { id: memory.id, key: memory.key, content: memory.content },
    }),
    activity: {
      query: memory.key,
      results: [{ title: memory.content, url: "" }],
    },
  };
}
