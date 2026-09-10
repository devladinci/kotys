import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import { getMessageRowsForChat, getChatById } from "@kotys/db";
import type { ToolContext } from "./types.js";

export const definition: ToolDefinition = {
  type: "function",
  category: "chat",
  function: {
    name: "get_chat",
    description:
      "Read the full message history of a past chat by its id. Returns the chat title, model, summary, topics, and all messages with their roles, full content, and timestamps. Use after list_chats or search_chats when you need the full context of a specific past conversation. For long chats, page with offset + limit.",
    parameters: {
      type: "object",
      required: ["chat_id"],
      properties: {
        chat_id: {
          type: "number",
          description: "The chat id from list_chats or search_chats.",
        },
        limit: {
          type: "number",
          description: "Maximum messages to return (default 50, max 200).",
        },
        offset: {
          type: "number",
          description:
            "Number of messages to skip from the start (default 0). Use with limit to page through long chats.",
        },
      },
    },
  },
};

const MAX_MESSAGES = 200;

export async function execute(
  args: ToolArgs,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const chatId = Math.floor(Number(args.chat_id));
  if (!chatId || chatId < 1) throw new Error("chat_id is required");
  const limit = Math.min(
    MAX_MESSAGES,
    Math.max(1, Math.floor(Number(args.limit) || 50)),
  );
  const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
  const messages = getMessageRowsForChat(chatId, limit, offset);
  const chat = getChatById(chatId);
  if (!chat) throw new Error(`chat ${chatId} not found`);
  return {
    content: JSON.stringify({
      chat: {
        id: chat.id,
        title: chat.title,
        model: chat.model,
        topics: chat.topics,
        summary: chat.summary,
        created_at: new Date(chat.created_at * 1000).toISOString(),
        updated_at: new Date(chat.updated_at * 1000).toISOString(),
      },
      offset,
      count: messages.length,
      ...(messages.length === limit ? { more: true } : {}),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: new Date(m.created_at * 1000).toISOString(),
      })),
    }),
    activity: {
      filePath: `chat #${chatId}`,
      results: [{ title: chat.title, url: "" }],
    },
  };
}
