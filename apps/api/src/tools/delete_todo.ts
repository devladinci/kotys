import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import { deleteTodo, getTodoById } from "@kotys/db";
import type { ToolContext } from "./types.js";
import { buildTodoWidget } from "./todoWidget.js";

export const definition: ToolDefinition = {
  type: "function",
  category: "task",
  function: {
    name: "delete_todo",
    description:
      "Permanently delete a task. Use it when the user asks to remove a task entirely. Todo ids come from list_todos or from a previous create_todo result.",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "number",
          description: "Id of the task to delete.",
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

  // Reporting `deleted: true` for an id that never existed taught the model
  // that the task was gone when nothing had happened.
  const existing = getTodoById(id);
  const deleted = deleteTodo(id);

  return {
    content: JSON.stringify(
      deleted
        ? { deleted: true, id }
        : {
            deleted: false,
            reason: `No task with id ${id}. Call list_todos to find the right id.`,
          },
    ),
    activity: existing
      ? { query: existing.title, widget: buildTodoWidget("deleted", existing) }
      : { query: String(id) },
  };
}
