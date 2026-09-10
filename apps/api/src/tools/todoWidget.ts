import type { TodoWidget } from "@kotys/contracts";

type TodoLike = {
  id: number;
  title: string;
  description: string | null;
  status?: string;
  priority?: string;
  due_at: number | null;
  notify_at: number | null;
};

/** The inline card the user sees in chat after a task tool ran. */
export function buildTodoWidget(
  action: TodoWidget["action"],
  todo: TodoLike,
): TodoWidget {
  return {
    kind: "todo",
    action,
    id: todo.id,
    title: todo.title,
    ...(todo.description ? { description: todo.description } : {}),
    ...(todo.status ? { status: todo.status as TodoWidget["status"] } : {}),
    ...(todo.priority
      ? { priority: todo.priority as TodoWidget["priority"] }
      : {}),
    due_at: todo.due_at,
    notify_at: todo.notify_at,
  };
}
