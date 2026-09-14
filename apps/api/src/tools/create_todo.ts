import type {
  ToolDefinition,
  ToolArgs,
  ToolResult,
  TodoPriority,
} from "@kotys/contracts";
import { createTodo } from "@kotys/db";
import type { ToolContext } from "./types.js";
import { buildTodoWidget } from "./todoWidget.js";
import { TODO_PRIORITIES } from "@kotys/contracts";
import { validateNewTodoDates } from "../validation/todoDates.js";
import { parseTodoDateArg } from "../validation/todoDateArgs.js";
import { secondsToDate, asEpochSeconds, type EpochSeconds } from "@kotys/contracts";

const PRIORITY_GUIDE =
  "low = nice to have, no urgency. " +
  "medium = normal priority (default). " +
  "high = important or urgent.";

export const definition: ToolDefinition = {
  type: "function",
  category: "task",
  function: {
    name: "create_todo",
    description:
      "Create a task (todo) with an optional due date and reminder. Use it when the user asks to create a task, set a reminder, schedule something, or add something to their list. The task appears in the Tasks sidebar.",
    parameters: {
      type: "object",
      required: ["title"],
      properties: {
        title: {
          type: "string",
          description: "Short, actionable task title.",
        },
        description: {
          type: "string",
          description: "Optional longer description with details or context.",
        },
        priority: {
          type: "string",
          enum: TODO_PRIORITIES,
          description: PRIORITY_GUIDE,
        },
        due_at: {
          type: "number",
          description:
            "Optional Unix timestamp (seconds) for when the task is due. Must be in the future — call current_datetime first if you are unsure of the current time. An ISO 8601 string is also accepted.",
        },
        notify_at: {
          type: "number",
          description:
            "Optional Unix timestamp (seconds) for when to send a native notification reminder. Must be in the future. An ISO 8601 string is also accepted.",
        },
      },
    },
  },
};

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const title = String(args.title ?? "").trim();
  if (!title) throw new Error("title is required");

  const description =
    typeof args.description === "string"
      ? args.description.trim() || null
      : null;

  const priority =
    typeof args.priority === "string" &&
    TODO_PRIORITIES.includes(args.priority as TodoPriority)
      ? (args.priority as TodoPriority)
      : "medium";

  const dates: Record<"due_at" | "notify_at", EpochSeconds | null> = {
    due_at: null,
    notify_at: null,
  };
  for (const field of ["due_at", "notify_at"] as const) {
    const raw = args[field];
    if (raw === undefined) continue;
    const parsed = parseTodoDateArg(field, raw);
    if ("error" in parsed) {
      return {
        content: JSON.stringify({
          created: false,
          reason: `${parsed.error} Call current_datetime to get the current time.`,
        }),
        activity: { query: title },
      };
    }
    dates[field] = parsed.value === null ? null : asEpochSeconds(parsed.value);
  }
  const due_at: EpochSeconds | null = dates.due_at;
  const notify_at: EpochSeconds | null = dates.notify_at;

  // Rejected here as well as in the main process so the model gets a message
  // it can act on rather than a bare thrown error.
  const problem = validateNewTodoDates({ due_at, notify_at });
  if (problem !== null) {
    return {
      content: JSON.stringify({
        created: false,
        reason: `${problem} Call current_datetime to get the current time, then pass a timestamp after it.`,
      }),
      activity: { query: title },
    };
  }

  const id = createTodo({
    title,
    description,
    priority,
    due_at,
    notify_at,
    chat_id: ctx.chatId,
    created_by: "agent",
  });

  const dueStr = secondsToDate(due_at)?.toISOString() ?? null;
  const notifyStr = secondsToDate(notify_at)?.toISOString() ?? null;

  return {
    content: JSON.stringify({
      created: true,
      todo: {
        id,
        title,
        description,
        priority,
        due_at: dueStr,
        notify_at: notifyStr,
      },
    }),
    activity: {
      query: title,
      widget: buildTodoWidget("created", {
        id,
        title,
        description,
        status: "pending",
        priority,
        due_at,
        notify_at,
      }),
    },
  };
}
