import type { EpochSeconds } from "../constants/epoch.js";

export type TodoStatus = "pending" | "in_progress" | "completed" | "archived";
export type TodoPriority = "low" | "medium" | "high";
export type TodoCreator = "user" | "agent";

export const TODO_STATUSES: TodoStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "archived",
];

export const TODO_PRIORITIES: TodoPriority[] = ["low", "medium", "high"];

export const TODO_SORT_STEP = 1000;

export type TodoRecord = {
  id: number;
  chat_id: number | null;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  due_at: EpochSeconds | null;
  notify_at: EpochSeconds | null;
  notified: number;
  completed_at: EpochSeconds | null;
  created_by: TodoCreator;
  created_at: EpochSeconds;
  updated_at: EpochSeconds;
  sort_order: number;
};

export type CreateTodoInput = {
  title: string;
  description?: string | null;
  chat_id?: number | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  due_at?: EpochSeconds | null;
  notify_at?: EpochSeconds | null;
  created_by?: TodoCreator;
};
