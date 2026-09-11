import { getDueReminders, markTodoNotified } from "@kotys/db";
import { events } from "./events.js";

const REMINDER_POLL_S = 60;
const REMINDER_LATE_S = 2 * REMINDER_POLL_S;
const MAX_REMINDER_NOTIFICATIONS = 3;

const revealTask = (todoId: number | null) => {
  events.emitEvent("todos:open", { todoId: todoId ?? 0 });
};

export const deliverReminders = () => {
  const now = Date.now();
  const nowSec = now / 1000;
  const due = getDueReminders(nowSec);
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
      const notifyAt = todo.notify_at ?? nowSec;
      const late = nowSec - notifyAt > REMINDER_LATE_S;
      events.emitEvent("notify", {
        title: late ? "Task reminder (missed)" : "Task reminder",
        body: todo.title,
        at: notifyAt * 1000,
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
  setInterval(deliverReminders, REMINDER_POLL_S * 1000);
}
