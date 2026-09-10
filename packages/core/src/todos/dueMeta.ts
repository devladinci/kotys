import { toMillis, type EpochSeconds } from "@kotys/contracts";
import type { TodoRecord } from "@kotys/contracts";

export const GROUP_ORDER = [
  "overdue",
  "today",
  "tomorrow",
  "this_week",
  "later",
  "no_date",
  "completed",
] as const;

export type TodoGroup = (typeof GROUP_ORDER)[number];

export const GROUP_LABELS: Record<TodoGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  this_week: "This week",
  later: "Later",
  no_date: "No date",
  completed: "Completed",
};

const startOfDay = (ts: number): Date => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (d: Date, n: number): number => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c.getTime();
};

export const groupFor = (todo: TodoRecord, now: number): TodoGroup => {
  if (todo.status === "completed") return "completed";
  if (todo.due_at === null) return "no_date";
  const due = toMillis(todo.due_at);
  if (due < now) return "overdue";
  const today = startOfDay(now);
  if (due < addDays(today, 1)) return "today";
  if (due < addDays(today, 2)) return "tomorrow";
  if (due < addDays(today, 7)) return "this_week";
  return "later";
};

export const isOverdue = (todo: TodoRecord, now: number): boolean =>
  todo.due_at !== null &&
  toMillis(todo.due_at) < now &&
  todo.status !== "completed";

const time = (ts: number): string =>
  new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

const shortDate = (ts: number, now: number): string => {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(
    undefined,
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
};

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const monthsBetween = (from: Date, to: Date): number => {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? months - 1 : months;
};

const elapsed = (ts: number, now: number): string | null => {
  const ms = now - ts;
  if (ms < MINUTE) return null;
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  const months = monthsBetween(new Date(ts), new Date(now));
  if (months < 1) return `${Math.floor(ms / DAY)}d`;
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
};

const hasTimeOfDay = (ts: number): boolean => {
  const d = new Date(ts);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
};

export const dueLabelFor = (todo: TodoRecord, now: number): string | null => {
  if (todo.due_at === null) return null;
  return dueTimestampLabel(
    toMillis(todo.due_at),
    now,
    todo.status !== "completed",
  );
};

export const dueTimestampLabel = (
  tsMs: number,
  now: number,
  canBeOverdue: boolean,
): string => {
  const ts = tsMs;
  const clock = hasTimeOfDay(ts) ? ` ${time(ts)}` : "";
  if (canBeOverdue && ts < now) {
    const by = elapsed(ts, now);
    return by === null ? "Overdue" : `${by} overdue`;
  }
  const today = startOfDay(now);
  if (ts < today.getTime()) return `${shortDate(ts, now)}${clock}`;
  if (ts < addDays(today, 1)) return `Today${clock}`;
  if (ts < addDays(today, 2)) return `Tomorrow${clock}`;
  if (ts < addDays(today, 7)) {
    const weekday = new Date(ts).toLocaleDateString(undefined, {
      weekday: "short",
    });
    return `${weekday}${clock}`;
  }
  return `${shortDate(ts, now)}${clock}`;
};

export const exactLabelFor = (ts: number): string =>
  new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const sameDay = (a: number, b: number): boolean => {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
};

export const reminderLabelFor = (
  tsMs: number,
  now: number,
  dueAtMs: EpochSeconds | number | null,
): string => {
  const ts = tsMs;
  const dueAt =
    dueAtMs === null
      ? null
      : typeof dueAtMs === "number" && dueAtMs > 1e11
        ? dueAtMs
        : toMillis(dueAtMs as EpochSeconds);
  const d = new Date(ts);
  if (dueAt !== null && sameDay(ts, dueAt)) return time(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
};
