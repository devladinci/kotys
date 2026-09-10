import type {
  ToolDefinition,
  ToolArgs,
  ToolResult,
  MemoryType,
} from "@kotys/contracts";
import { getMemoryByKey, createMemory } from "@kotys/db";
import type { ToolContext } from "./types.js";
import { MEMORY_TYPES } from "@kotys/contracts";

const TYPE_GUIDE =
  "user = a durable fact about the user (their role, setup, situation). " +
  "preference = how they want you to work or answer. " +
  "project = ongoing work, a goal, or a constraint. " +
  "fact = an external reference worth keeping (an id, a number, a link).";

export const definition: ToolDefinition = {
  type: "function",
  category: "memory",
  function: {
    name: "create_memory",
    description:
      "Save one durable fact so it is available in every future chat. Use it for things that stay true after this conversation ends: who the user is, how they want you to work, what they are building, references worth keeping. Do not use it for conversation state, for something already in memory, or for anything you could look up again. Save one fact per call.",
    parameters: {
      type: "object",
      required: ["key", "content", "type"],
      properties: {
        key: {
          type: "string",
          description:
            'Short kebab-case identifier for this fact, e.g. "prefers-vitest" or "works-at-acme". Keys are unique: if one already exists, you are told its id so you can call update_memory instead.',
        },
        content: {
          type: "string",
          description:
            "The fact itself, in one or two sentences. Write it so it makes sense on its own months from now, with no reference to the current conversation.",
        },
        type: {
          type: "string",
          enum: MEMORY_TYPES,
          description: TYPE_GUIDE,
        },
        topics: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional tags used to surface this memory in related chats later. Defaults to the current chat's topics. Reuse existing topic words where they fit rather than inventing near-duplicates.",
        },
      },
    },
  },
};

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const key = String(args.key ?? "").trim();
  const content = String(args.content ?? "").trim();
  const type = String(args.type ?? "") as MemoryType;
  if (!key) throw new Error("key is required");
  if (content.length < 3) throw new Error("content is required");
  if (!MEMORY_TYPES.includes(type)) {
    throw new Error(`type must be one of: ${MEMORY_TYPES.join(", ")}`);
  }

  const topics = Array.isArray(args.topics)
    ? args.topics.filter((t): t is string => typeof t === "string")
    : ctx.chatTopics;

  const existing = getMemoryByKey(key);
  if (existing) {
    return {
      content: JSON.stringify({
        created: false,
        reason: "A memory with this key already exists.",
        next_step:
          "Call update_memory with this id if the fact changed, or leave it as it is.",
        memory: {
          id: existing.id,
          key: existing.key,
          type: existing.type,
          content: existing.content,
          topics: existing.topics,
        },
      }),
      activity: { query: key },
    };
  }

  const memory = createMemory({
    key,
    content,
    type,
    topics,
    sourceChatId: ctx.chatId,
  });

  return {
    content: JSON.stringify({
      created: true,
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
