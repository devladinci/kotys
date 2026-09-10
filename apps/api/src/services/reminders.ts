import { getDueReminders, markTodoNotified } from "@kotys/db";
import { events } from "./events.js";

const REMINDER_POLL_MS = 60_000;
const REMINDER_LATE_MS = 2 * REMINDER_POLL_MS;
const MAX_REMINDER_NOTIFICATIONS = 3;

const revealTask = (todoId: number | null) => {
  events.emitEvent("todos:open", { todoId: todoId ?? 0 });
};

const deliverReminders = () => {
  const now = Date.now();
  const due = getDueReminders(now);
  if (due.length === 0) return;

  if (due.length > MAX_REMINDER_NOTIFICATIONS) {
    const names = due
      .slice(0, MAX_REMINDER_NOTIFICATIONS)
      .map((t) => t.title)
      .join(", ");
    events.emitEvent("notify", {
      title: `${due.length} task reminders`,
      body: `${names}, and ${due.length - MAX_REMINDER_NOTIFICATIONS} more`,
      at: now,
    });
    revealTask(null);
  } else {
    for (const todo of due) {
      const late = now - (todo.notify_at ?? now) > REMINDER_LATE_MS;
      events.emitEvent("notify", {
        title: late ? "Task reminder (missed)" : "Task reminder",
        body: todo.title,
        at: todo.notify_at ?? now,
        todoId: todo.id,
      });
      revealTask(todo.id);
    }
  }

  for (const todo of due) markTodoNotified(todo.id);
  events.emitEvent("todos:changed");
};

export function startReminderScheduler(): void {
  setTimeout(deliverReminders, 5000);
  setInterval(deliverReminders, REMINDER_POLL_MS);
}
