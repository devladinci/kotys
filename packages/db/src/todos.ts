import type { CreateTodoInput, TodoRecord } from "@kotys/contracts";
import { TODO_SORT_STEP } from "@kotys/contracts";
import { getDb } from "./client.js";

const secondsNow = () => Math.floor(Date.now() / 1000);

export function listTodos(filters?: {
  status?: string;
  chat_id?: number;
  has_due_date?: boolean;
}): TodoRecord[] {
  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];
  if (filters?.status && filters.status !== "all") {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters?.chat_id) {
    where.push("chat_id = ?");
    params.push(filters.chat_id);
  }
  if (filters?.has_due_date) {
    where.push("due_at IS NOT NULL");
  }
  return getDb()
    .prepare(
      `SELECT ${TODO_COLS} FROM todos WHERE ${where.join(" AND ")} ORDER BY due_at IS NULL, sort_order ASC, due_at ASC, created_at DESC`,
    )
    .all(...params) as TodoRecord[];
}
const TODO_COLS = `id, chat_id, title, description, status, priority, due_at, notify_at, notified, completed_at, created_by, created_at, updated_at, sort_order`;
const TODO_UPDATABLE = [
  "title",
  "description",
  "status",
  "priority",
  "due_at",
  "notify_at",
  "notified",
  "completed_at",
  "chat_id",
  "sort_order",
];
export function createTodo(input: CreateTodoInput): number {
  const db = getDb();
  const { max } = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max FROM todos")
    .get() as { max: number };
  const result = db
    .prepare(
      `INSERT INTO todos (title, description, chat_id, status, priority, due_at, notify_at, created_by, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
    )
    .run(
      input.title,
      input.description ?? null,
      input.chat_id ?? null,
      input.status ?? "pending",
      input.priority ?? "medium",
      input.due_at ?? null,
      input.notify_at ?? null,
      input.created_by ?? "user",
      max + TODO_SORT_STEP,
    );
  return Number(result.lastInsertRowid);
}
export function updateTodo(
  id: number,
  fields: Partial<TodoRecord>,
): TodoRecord | null {
  const current = getTodoById(id);
  if (!current) return null;
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (TODO_UPDATABLE.includes(key) && value !== undefined) {
      sets.push(`${key} = ?`);
      params.push(value as string | number | null);
    }
  }
  if (
    fields.notify_at !== undefined &&
    fields.notify_at !== current.notify_at &&
    fields.notified === undefined
  ) {
    sets.push("notified = 0");
  }
  if (sets.length === 0) return current;
  sets.push("updated_at = unixepoch()");
  params.push(id);
  getDb()
    .prepare(`UPDATE todos SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
  return getTodoById(id);
}
export function deleteTodo(id: number): boolean {
  const db = getDb();
  return db.transaction(() => {
    db.prepare("UPDATE chats SET todo_id = NULL WHERE todo_id = ?").run(id);
    return db.prepare("DELETE FROM todos WHERE id = ?").run(id).changes > 0;
  })();
}
export function getTodoById(id: number): TodoRecord | null {
  const row = getDb()
    .prepare(`SELECT ${TODO_COLS} FROM todos WHERE id = ?`)
    .get(id) as TodoRecord | undefined;
  return row ?? null;
}
export function toggleTodoStatus(id: number): TodoRecord | null {
  const todo = getTodoById(id);
  if (!todo) return null;
  const newStatus = todo.status === "completed" ? "pending" : "completed";
  const completed_at = newStatus === "completed" ? secondsNow() : null;
  const notified =
    newStatus === "pending" &&
    todo.notify_at !== null &&
    todo.notify_at > secondsNow()
      ? 0
      : todo.notified;
  getDb()
    .prepare(
      "UPDATE todos SET status = ?, completed_at = ?, notified = ?, updated_at = unixepoch() WHERE id = ?",
    )
    .run(newStatus, completed_at, notified, id);
  return getTodoById(id);
}
export function getDueReminders(now: number): TodoRecord[] {
  return getDb()
    .prepare(
      `SELECT ${TODO_COLS} FROM todos
       WHERE notify_at IS NOT NULL AND notify_at <= ? AND notified = 0
         AND status NOT IN ('completed', 'archived')
       ORDER BY notify_at ASC`,
    )
    .all(now) as TodoRecord[];
}
export function markTodoNotified(id: number): void {
  getDb()
    .prepare(
      "UPDATE todos SET notified = 1, updated_at = unixepoch() WHERE id = ?",
    )
    .run(id);
}
export function reorderTodos(order: number[]): void {
  if (order.length === 0) return;
  const stmt = getDb().prepare(
    "UPDATE todos SET sort_order = ?, updated_at = unixepoch() WHERE id = ?",
  );
  const tx = getDb().transaction(() => {
    order.forEach((id, index) => stmt.run((index + 1) * TODO_SORT_STEP, id));
  });
  tx();
}
