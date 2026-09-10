// One rule, three callers: the task form in the client, the create/update
// agent tools, and the API route handlers. Kept here so all three can import
// it without one depending on another.

/**
 * `datetime-local` has minute granularity, so picking the current minute at
 * :45 seconds yields a timestamp already 45s in the past. Without this the
 * only safe choice would be the *next* minute, which reads as a bug.
 */
export const PAST_DATE_GRACE_S = 60;

export type TodoDateField = "due_at" | "notify_at";

const LABEL: Record<TodoDateField, string> = {
  due_at: "Due date",
  notify_at: "Reminder",
};

const nowS = (): number => Math.floor(Date.now() / 1000);

const isPast = (ts: number, now: number = nowS()): boolean =>
  ts < now - PAST_DATE_GRACE_S;

/** Human-readable reason, or null when the value is acceptable. */
export const pastDateError = (
  field: TodoDateField,
  ts: number | null | undefined,
  now: number = nowS(),
): string | null => {
  if (ts === null || ts === undefined) return null;
  if (!isPast(ts, now)) return null;
  return `${LABEL[field]} is in the past. Pick a time in the future.`;
};

export interface TodoDateInput {
  due_at?: number | null;
  notify_at?: number | null;
}

/**
 * Validates a new task. Returns the first problem found, or null.
 */
export const validateNewTodoDates = (
  input: TodoDateInput,
  now: number = nowS(),
): string | null =>
  pastDateError("due_at", input.due_at, now) ??
  pastDateError("notify_at", input.notify_at, now);

/**
 * Validates an edit. Only fields being *changed* are checked: a task that is
 * already overdue must stay editable — otherwise renaming last year's task
 * would be impossible without also rescheduling it.
 */
export const validateTodoDateChanges = (
  changes: TodoDateInput,
  current: { due_at: number | null; notify_at: number | null },
  now: number = nowS(),
): string | null => {
  const due =
    changes.due_at !== undefined && changes.due_at !== current.due_at
      ? pastDateError("due_at", changes.due_at, now)
      : null;
  if (due !== null) return due;
  return changes.notify_at !== undefined &&
    changes.notify_at !== current.notify_at
    ? pastDateError("notify_at", changes.notify_at, now)
    : null;
};
