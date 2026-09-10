import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import { listTodos } from "@kotys/db";
import type { ToolContext } from "./types.js";
import { TODO_STATUSES } from "@kotys/contracts";

export const definition: ToolDefinition = {
  type: "function",
  category: "task",
  function: {
    name: "list_todos",
    description:
      "List the user's tasks. Returns all tasks or filters by status or due date. Use it when the user asks what's on their list, what's pending, or what's due. Timestamps come back as ISO 8601 strings.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: TODO_STATUSES,
          description: "Filter by status. Omit for all.",
        },
        has_due_date: {
          type: "boolean",
          description: "If true, only return tasks that have a due date.",
        },
      },
    },
  },
};

const secondsToIso = (ts: number | null): string | null =>
  ts === null ? null : new Date(ts * 1000).toISOString();

export async function execute(
  args: ToolArgs,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const filters: { status?: string; has_due_date?: boolean } = {};

  if (typeof args.status === "string" && args.status.trim()) {
    filters.status = args.status.trim();
  }
  if (typeof args.has_due_date === "boolean") {
    filters.has_due_date = args.has_due_date;
  }

  const todos = listTodos(filters);

  return {
    content: JSON.stringify({
      count: todos.length,
      todos: todos.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        due_at: secondsToIso(t.due_at),
        notify_at: secondsToIso(t.notify_at),
        created_at: secondsToIso(t.created_at),
      })),
    }),
    activity: {
      query: filters.status ?? "all",
      results: todos.slice(0, 20).map((t) => ({
        title: `${t.title}${t.due_at !== null ? ` — due ${new Date(t.due_at * 1000).toISOString().slice(0, 10)}` : ""}`,
        url: "",
      })),
    },
  };
}
