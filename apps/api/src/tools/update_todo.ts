import type {
  ToolDefinition,
  ToolArgs,
  ToolResult,
  TodoStatus,
  TodoPriority,
} from "@kotys/contracts";
import { getTodoById, updateTodo } from "@kotys/db";
import type { ToolContext } from "./types.js";
import { buildTodoWidget } from "./todoWidget.js";
import { TODO_STATUSES, TODO_PRIORITIES } from "@kotys/contracts";
import { validateTodoDateChanges } from "../validation/todoDates.js";
import { secondsToDate, asEpochSeconds } from "@kotys/contracts";

export const definition: ToolDefinition = {
  type: "function",
  category: "task",
  function: {
    name: "update_todo",
    description:
      "Update an existing task. Pass only the fields you want to change. Todo ids come from list_todos or from a previous create_todo result.",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "number",
          description: "Id of the task to update.",
        },
        title: {
          type: "string",
          description: "New title.",
        },
        description: {
          type: "string",
          description: "New description.",
        },
        status: {
          type: "string",
          enum: TODO_STATUSES,
          description:
            "New status. Use 'completed' to mark done, 'pending' to reopen, 'in_progress' when actively working on it, 'archived' to hide.",
        },
        priority: {
          type: "string",
          enum: TODO_PRIORITIES,
          description: "New priority level.",
        },
        due_at: {
          type: ["number", "null"],
          description:
            "New due date as Unix timestamp (seconds), or null to clear.",
        },
        notify_at: {
          type: ["number", "null"],
          description:
            "New reminder time as Unix timestamp (seconds), or null to clear. Changing this re-arms the reminder even if the old one already fired.",
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
  if (!Number.isInteger(id) || id <= 0) throw new Error("id must be a task id");

  const fields: Record<string, unknown> = {};

  if (typeof args.title === "string" && args.title.trim()) {
    fields.title = args.title.trim();
  }
  if (typeof args.description === "string") {
    fields.description = args.description.trim() || null;
  }
  if (
    typeof args.status === "string" &&
    TODO_STATUSES.includes(args.status as TodoStatus)
  ) {
    fields.status = args.status as TodoStatus;
    fields.completed_at =
      args.status === "completed" ? Math.floor(Date.now() / 1000) : null;
  }
  if (
    typeof args.priority === "string" &&
    TODO_PRIORITIES.includes(args.priority as TodoPriority)
  ) {
    fields.priority = args.priority as TodoPriority;
  }
  // Kept in typed locals as well as in `fields`: `fields` is a loose
  // Record<string, unknown>, so handing it straight to the date validator
  // would type-check even if a refactor stopped putting dates in it.
  let due_at: number | null | undefined;
  let notify_at: number | null | undefined;
  if (args.due_at !== undefined) {
    due_at =
      typeof args.due_at === "number" && args.due_at > 0
        ? Math.round(args.due_at)
        : null;
    fields.due_at = due_at === null ? null : asEpochSeconds(due_at);
  }
  if (args.notify_at !== undefined) {
    notify_at =
      typeof args.notify_at === "number" && args.notify_at > 0
        ? Math.round(args.notify_at)
        : null;
    fields.notify_at = notify_at === null ? null : asEpochSeconds(notify_at);
  }

  if (Object.keys(fields).length === 0) {
    throw new Error("pass at least one field to update");
  }

  const current = getTodoById(id);
  if (!current) {
    return {
      content: JSON.stringify({
        updated: false,
        reason: `No task with id ${id}. Call list_todos to find the right id.`,
      }),
      activity: { query: String(id) },
    };
  }

  // Only a date the model is actually changing has to be in the future — a
  // task that is already overdue stays editable.
  const problem = validateTodoDateChanges({ due_at, notify_at }, current);
  if (problem !== null) {
    return {
      content: JSON.stringify({
        updated: false,
        reason: `${problem} Call current_datetime to get the current time, then pass a timestamp after it.`,
      }),
      activity: { query: String(id) },
    };
  }

  const todo = updateTodo(id, fields);
  if (!todo) {
    return {
      content: JSON.stringify({
        updated: false,
        reason: `No task with id ${id}. Call list_todos to find the right id.`,
      }),
      activity: { query: String(id) },
    };
  }

  return {
    content: JSON.stringify({
      updated: true,
      todo: {
        id: todo.id,
        title: todo.title,
        status: todo.status,
        priority: todo.priority,
        due_at: secondsToDate(todo.due_at)?.toISOString() ?? null,
        notify_at: secondsToDate(todo.notify_at)?.toISOString() ?? null,
      },
    }),
    activity: {
      query: todo.title,
      widget: buildTodoWidget("updated", todo),
    },
  };
}
