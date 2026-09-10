import type {
  CreatePomodoroSessionInput,
  PomodoroSessionRecord,
  PomodoroStatus,
} from "@kotys/contracts";
import { getDb } from "./client.js";

const POMODORO_COLS = `id, chat_id, todo_id, task, duration_seconds, break_seconds, started_at, ended_at, completed_at, status, phase, ends_at, cycles, cycles_completed, updated_at, remaining_at_pause`;
export function createPomodoroSession(
  input: CreatePomodoroSessionInput,
): PomodoroSessionRecord {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const duration = Math.max(1, Math.round(input.duration_seconds ?? 1500));
  const result = db
    .prepare(
      `INSERT INTO pomodoro_sessions
       (chat_id, todo_id, task, duration_seconds, break_seconds, status, phase, ends_at, cycles, cycles_completed, started_at, updated_at, remaining_at_pause)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.chat_id ?? null,
      input.todo_id ?? null,
      input.task ?? null,
      duration,
      Math.max(0, Math.round(input.break_seconds ?? 300)),
      "running",
      "focus",
      now + duration,
      Math.max(1, Math.round(input.cycles ?? 1)),
      0,
      now,
      now,
      null,
    );
  return getPomodoroSessionById(
    Number(result.lastInsertRowid),
  ) as PomodoroSessionRecord;
}
export function getPomodoroSessionById(
  id: number,
): PomodoroSessionRecord | null {
  const row = getDb()
    .prepare(`SELECT ${POMODORO_COLS} FROM pomodoro_sessions WHERE id = ?`)
    .get(id) as PomodoroSessionRecord | undefined;
  return row ?? null;
}
export function getActivePomodoroSession(): PomodoroSessionRecord | null {
  const row = getDb()
    .prepare(
      `SELECT ${POMODORO_COLS} FROM pomodoro_sessions
       WHERE status IN ('running', 'paused') ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as PomodoroSessionRecord | undefined;
  return row ?? null;
}
export function listPomodoroSessions(limit = 50): PomodoroSessionRecord[] {
  return getDb()
    .prepare(
      `SELECT ${POMODORO_COLS} FROM pomodoro_sessions ORDER BY started_at DESC LIMIT ?`,
    )
    .all(limit) as PomodoroSessionRecord[];
}
export function updatePomodoroSession(
  id: number,
  fields: Partial<PomodoroSessionRecord>,
): PomodoroSessionRecord | null {
  const current = getPomodoroSessionById(id);
  if (!current) return null;
  const allowed: (keyof PomodoroSessionRecord)[] = [
    "chat_id",
    "todo_id",
    "task",
    "duration_seconds",
    "break_seconds",
    "ended_at",
    "completed_at",
    "status",
    "phase",
    "ends_at",
    "cycles",
    "cycles_completed",
    "remaining_at_pause",
  ];
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (!allowed.includes(key as keyof PomodoroSessionRecord)) {
      // Silently dropping a field here once made resume work only by accident.
      throw new Error(`Cannot update pomodoro field: ${key}`);
    }
    sets.push(`${key} = ?`);
    params.push(value as string | number | null);
  }
  if (sets.length === 0) return current;
  sets.push("updated_at = unixepoch()");
  params.push(id);
  getDb()
    .prepare(`UPDATE pomodoro_sessions SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
  return getPomodoroSessionById(id);
}
export function pausePomodoroSession(
  id: number,
  remaining: number,
): PomodoroSessionRecord | null {
  const current = getPomodoroSessionById(id);
  if (!current) return null;
  getDb()
    .prepare(
      `UPDATE pomodoro_sessions SET status = 'paused', ends_at = NULL, remaining_at_pause = ?, updated_at = unixepoch() WHERE id = ?`,
    )
    .run(Math.max(0, Math.round(remaining)), id);
  return getPomodoroSessionById(id);
}
export function resumePomodoroSession(
  id: number,
): PomodoroSessionRecord | null {
  const current = getPomodoroSessionById(id);
  if (!current) return null;
  const fallback =
    current.phase === "break"
      ? current.break_seconds
      : current.duration_seconds;
  const remaining =
    current.remaining_at_pause !== null && current.remaining_at_pause > 0
      ? current.remaining_at_pause
      : fallback;
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `UPDATE pomodoro_sessions SET status = 'running', ended_at = NULL, ends_at = ?, remaining_at_pause = NULL, updated_at = unixepoch() WHERE id = ?`,
    )
    .run(now + Math.max(1, remaining), id);
  return getPomodoroSessionById(id);
}
export function stopPomodoroSession(
  id: number,
  status: PomodoroStatus,
): PomodoroSessionRecord | null {
  const current = getPomodoroSessionById(id);
  if (!current) return null;
  const now = Math.floor(Date.now() / 1000);
  // Only a session that actually ran to term is "completed". Cancelling one
  // must not stamp completed_at, or every abandoned session counts as a win.
  const completedAt = status === "completed" ? now : current.completed_at;
  getDb()
    .prepare(
      `UPDATE pomodoro_sessions SET status = ?, ended_at = ?, completed_at = ?, ends_at = NULL, remaining_at_pause = NULL, updated_at = unixepoch() WHERE id = ?`,
    )
    .run(status, now, completedAt, id);
  return getPomodoroSessionById(id);
}
export function cancelStalePomodoroSessions(exceptId?: number): number {
  const now = Math.floor(Date.now() / 1000);
  const result = getDb()
    .prepare(
      `UPDATE pomodoro_sessions
       SET status = 'cancelled', ended_at = COALESCE(ended_at, ?), ends_at = NULL,
           remaining_at_pause = NULL, updated_at = unixepoch()
       WHERE status IN ('running', 'paused') AND id IS NOT ?`,
    )
    .run(now, exceptId ?? null);
  return result.changes;
}
