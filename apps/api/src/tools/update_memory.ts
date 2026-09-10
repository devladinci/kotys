import type {
  ToolDefinition,
  ToolArgs,
  ToolResult,
  MemoryType,
} from "@kotys/contracts";
import { updateMemory } from "@kotys/db";
import type { ToolContext } from "./types.js";
import { MEMORY_TYPES } from "@kotys/contracts";

export const definition: ToolDefinition = {
  type: "function",
  category: "memory",
  function: {
    name: "update_memory",
    description:
      "Revise a memory that is no longer accurate or complete. Prefer this over creating a second memory about the same thing. Memory ids come from the memory block in your context or from search_memories.",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "number",
          description: "Id of the memory to revise.",
        },
        content: {
          type: "string",
          description:
            "Replacement text, written to stand on its own. Restate the whole fact — this overwrites the old text rather than appending to it.",
        },
        type: {
          type: "string",
          enum: MEMORY_TYPES,
          description: "Optional: change the memory's type.",
        },
        topics: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional: replace the memory's topics. Pass the full list, not just additions.",
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

  const content =
    typeof args.content === "string" && args.content.trim()
      ? args.content.trim()
      : undefined;
  const type =
    typeof args.type === "string" &&
    MEMORY_TYPES.includes(args.type as MemoryType)
      ? (args.type as MemoryType)
      : undefined;
  const topics = Array.isArray(args.topics)
    ? args.topics.filter((t): t is string => typeof t === "string")
    : undefined;

  if (content === undefined && type === undefined && topics === undefined) {
    throw new Error("pass at least one of content, type, or topics");
  }

  const memory = updateMemory(id, { content, type, topics });
  if (!memory) {
    return {
      content: JSON.stringify({
        updated: false,
        reason: `No memory with id ${id}. Call search_memories to find the right id.`,
      }),
      activity: { query: String(id) },
    };
  }

  return {
    content: JSON.stringify({
      updated: true,
      memory: {
        id: memory.id,
        key: memory.key,
        type: memory.type,
        content: memory.content,
        topics: memory.topics,
      },
    }),
    activity: {
      query: memory.key,
      results: [{ title: memory.content, url: "" }],
    },
  };
}
