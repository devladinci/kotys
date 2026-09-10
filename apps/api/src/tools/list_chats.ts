import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import { listChatsWithTopics } from "@kotys/db";
import type { ToolContext } from "./types.js";

const MAX_CHATS = 50;

export const definition: ToolDefinition = {
  type: "function",
  category: "chat",
  function: {
    name: "list_chats",
    description:
      "List the user's past chats with their titles, topics, model, and last-updated time. Optional topic filter returns only chats matching that topic. Use to browse conversation history and find related chats.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            'Optional: only return chats with this topic (case-insensitive substring match, e.g. "react", "trading").',
        },
      },
    },
  },
};

export async function execute(
  args: ToolArgs,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const topic =
    typeof args.topic === "string"
      ? args.topic.trim().toLowerCase()
      : undefined;
  let chats = listChatsWithTopics().map((r) => ({
    id: r.id,
    title: r.title,
    model: r.model_name ?? "",
    topics: (r.topics_blob ?? "").split("\u001e").filter(Boolean) as string[],
    summary: r.summary ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  if (topic) {
    chats = chats.filter((c) =>
      c.topics.some((t) => t.toLowerCase().includes(topic)),
    );
  }
  const truncated = chats.length > MAX_CHATS;
  const slice = chats.slice(0, MAX_CHATS);
  return {
    content: JSON.stringify({
      count: chats.length,
      ...(truncated ? { truncated: true } : {}),
      chats: slice.map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        topics: c.topics,
        updated_at: new Date(c.updated_at * 1000).toISOString(),
      })),
    }),
    activity: {
      query: topic,
      results: slice.map((c) => ({
        title: c.topics.length
          ? `${c.title} [${c.topics.join(", ")}]`
          : c.title,
        url: "",
      })),
    },
  };
}
