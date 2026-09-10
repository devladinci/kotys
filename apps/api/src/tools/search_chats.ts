import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import { searchMessages } from "@kotys/db";
import type { ToolContext } from "./types.js";

export const definition: ToolDefinition = {
  type: "function",
  category: "chat",
  function: {
    name: "search_chats",
    description:
      "Search the user's past chat messages for a text query. Returns matching messages with their chat id, chat title, role, and a snippet. Use to find past discussions about a topic, recall a previous answer, or cross-reference information across conversations.",
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "Text to search for in message content. Case-insensitive, all words must appear.",
        },
      },
    },
  },
};

export async function execute(
  args: ToolArgs,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const query = String(args.query ?? "").trim();
  if (query.length < 2) throw new Error("query must be at least 2 characters");
  const hits = searchMessages(query);
  return {
    content: JSON.stringify({
      query,
      count: hits.length,
      results: hits.map((h) => ({
        message_id: h.id,
        chat_id: h.chat_id,
        chat_title: h.title,
        role: h.role,
        created_at: new Date(h.created_at * 1000).toISOString(),
        snippet: h.snippet,
      })),
    }),
    activity: {
      query,
      results: hits.slice(0, 20).map((h) => ({
        title: `${h.title}: ${h.snippet.slice(0, 60)}`,
        url: "",
      })),
    },
  };
}
