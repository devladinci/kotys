import type {
  ToolDefinition,
  ToolArgs,
  ToolResult,
  MemoryType,
} from "@kotys/contracts";
import { searchMemories } from "@kotys/db";
import type { ToolContext } from "./types.js";
import { MEMORY_TYPES } from "@kotys/contracts";

const MAX_RESULTS = 30;

export const definition: ToolDefinition = {
  type: "function",
  category: "memory",
  function: {
    name: "search_memories",
    description:
      "Search everything you have saved to memory. The memory block in your context only carries what is always relevant plus what matches this chat's topics — call this when the user refers to something you were told before that is not in that block, or when you need a memory's id before updating or deleting it. With no arguments it returns the most recently changed memories.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Optional text to match against memory content and keys. Case-insensitive substring match.",
        },
        topic: {
          type: "string",
          description:
            "Optional: only memories tagged with this topic (substring match).",
        },
        type: {
          type: "string",
          enum: MEMORY_TYPES,
          description: "Optional: only memories of this type.",
        },
      },
    },
  },
};

export async function execute(
  args: ToolArgs,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const query = typeof args.query === "string" ? args.query.trim() : undefined;
  const topic = typeof args.topic === "string" ? args.topic.trim() : undefined;
  const type =
    typeof args.type === "string" &&
    MEMORY_TYPES.includes(args.type as MemoryType)
      ? (args.type as MemoryType)
      : undefined;

  const hits = searchMemories({
    query,
    topic,
    type,
    limit: MAX_RESULTS,
  });

  return {
    content: JSON.stringify({
      count: hits.length,
      memories: hits.map((m) => ({
        id: m.id,
        key: m.key,
        type: m.type,
        content: m.content,
        topics: m.topics,
        source_chat_id: m.source_chat_id,
        updated_at: new Date(m.updated_at * 1000).toISOString(),
      })),
    }),
    activity: {
      query: query || topic || type || "all",
      results: hits.map((m) => ({ title: `${m.key}: ${m.content}`, url: "" })),
    },
  };
}
