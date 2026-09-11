import { memo, useState } from "react";
import { Bell, Check, CalendarClock } from "lucide-react";
import type { TodoWidget } from "@kotys/contracts";
import TodoPriorityBadge from "../../todos/TodoPriorityBadge";
import {
  dueTimestampLabel,
  exactLabelFor,
  reminderLabelFor,
} from "@kotys/core";

const ACTION_PAST: Record<TodoWidget["action"], string> = {
  created: "Created task",
  updated: "Updated task",
  completed: "Completed task",
  reopened: "Reopened task",
  deleted: "Deleted task",
};

const toDate = (value: NonNullable<TodoWidget["due_at"]>): number | null => {
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return ms < 1e11 ? ms * 1000 : ms;
};

function TodoCardBase({ widget }: { widget: TodoWidget }) {
  const deleted = widget.action === "deleted";
  const completed = widget.status === "completed";
  // Stale like the chat text it sits under — no ticking clock here.
  const [now] = useState(() => Date.now());
  const dueMs = widget.due_at != null ? toDate(widget.due_at) : null;
  const notifyMs = widget.notify_at != null ? toDate(widget.notify_at) : null;
  const overdue = dueMs !== null && dueMs < now && !completed && !deleted;
  const done = completed || deleted;

  const status =
    widget.status === "in_progress" || widget.status === "archived"
      ? widget.status === "in_progress"
        ? "In progress"
        : "Archived"
      : null;

  return (
    <div
      title={ACTION_PAST[widget.action]}
      className={`my-2 rounded-lg border bg-surface overflow-hidden max-w-md px-3 py-2.5 ${
        overdue ? "border-red-400/40" : "border-border"
      } ${deleted ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        {!deleted && (
          <span
            aria-hidden="true"
            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
              completed ? "bg-accent border-accent" : "border-border"
            }`}
          >
            {completed && (
              <Check size={11} strokeWidth={3} className="text-white" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm font-medium break-words ${
              done ? "line-through text-text-muted" : "text-text"
            }`}
          >
            {widget.title}
          </div>
          {widget.description && (
            <div className="text-xs text-text-muted mt-1 line-clamp-3 break-words">
              {widget.description}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            {status && (
              <span className="text-[11px] text-text-muted">{status}</span>
            )}
            {widget.priority && !deleted && (
              <TodoPriorityBadge priority={widget.priority} />
            )}
            {dueMs !== null && (
              <span
                title={exactLabelFor(dueMs)}
                className={`inline-flex items-center gap-1 text-[11px] ${
                  overdue ? "text-red-400" : "text-text-muted"
                }`}
              >
                <CalendarClock size={11} aria-hidden="true" />
                {dueTimestampLabel(dueMs, now, !completed && !deleted)}
              </span>
            )}
            {notifyMs !== null && !deleted && (
              <span
                title={exactLabelFor(notifyMs)}
                className="inline-flex items-center gap-1 text-[11px] text-text-muted"
              >
                <Bell size={11} aria-hidden="true" />
                {reminderLabelFor(notifyMs, now, dueMs)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TodoCard = memo(TodoCardBase);
export default TodoCard;
