import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import { toggleTodoStatus } from "@kotys/db";
import type { ToolContext } from "./types.js";
import { buildTodoWidget } from "./todoWidget.js";

export const definition: ToolDefinition = {
  type: "function",
  category: "task",
  function: {
    name: "complete_todo",
    description:
      "Toggle a task between completed and pending. Use it to mark a task done or to reopen one. Todo ids come from list_todos or from a previous create_todo result.",
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: {
          type: "number",
          description: "Id of the task to toggle.",
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

  const todo = toggleTodoStatus(id);
  if (!todo) {
    return {
      content: JSON.stringify({
        toggled: false,
        reason: `No task with id ${id}.`,
      }),
      activity: { query: String(id) },
    };
  }

  return {
    content: JSON.stringify({
      toggled: true,
      id: todo.id,
      title: todo.title,
      status: todo.status,
    }),
    activity: {
      query: todo.title,
      widget: buildTodoWidget(
        todo.status === "completed" ? "completed" : "reopened",
        todo,
      ),
    },
  };
}
