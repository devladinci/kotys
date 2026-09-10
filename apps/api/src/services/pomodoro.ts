import {
  getSetting,
  createPomodoroSession,
  getActivePomodoroSession,
  updatePomodoroSession as dbUpdatePomodoroSession,
  stopPomodoroSession as dbStopPomodoroSession,
  pausePomodoroSession as dbPausePomodoroSession,
  resumePomodoroSession as dbResumePomodoroSession,
  cancelStalePomodoroSessions,
} from "@kotys/db";
import type {
  PomodoroSessionRecord,
  PomodoroStatus,
  PomodoroPhase,
  CreatePomodoroSessionInput,
} from "@kotys/contracts";
import { events } from "./events.js";

const POMODORO_TICK_MS = 1000;
const POMODORO_SETTINGS = {
  duration: "pomodoro_duration_minutes",
  break: "pomodoro_break_minutes",
};
const POMODORO_STALE_OVERSHOOT_SECONDS = 120;

interface ActivePomodoro {
  session: PomodoroSessionRecord;
  interval: ReturnType<typeof setInterval>;
}

let activePomodoro: ActivePomodoro | null = null;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function remainingSeconds(session: PomodoroSessionRecord): number {
  if (session.status === "paused") {
    return Math.max(0, session.remaining_at_pause ?? 0);
  }
  if (session.ends_at === null) return 0;
  return Math.max(0, Math.ceil(session.ends_at - Date.now() / 1000));
}

function pomodoroSettingMinutes(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = getSetting(key);
  const parsed = raw === null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function notify(title: string, body: string) {
  events.emitEvent("notify", { title, body });
}

function clearPomodoroTimer() {
  if (activePomodoro) {
    clearInterval(activePomodoro.interval);
    activePomodoro = null;
  }
}

function completePomodoro(status: PomodoroStatus, notifyUser: boolean) {
  const active = activePomodoro;
  if (!active) return null;
  const finished = dbStopPomodoroSession(active.session.id, status);
  clearPomodoroTimer();
  if (!finished) return null;
  events.emitEvent("pomodoro:done", finished);
  if (notifyUser && status === "completed") {
    notify(
      "Pomodoro complete",
      finished.task ? `Finished: ${finished.task}` : "Focus session finished",
    );
  }
  return finished;
}

function advancePomodoroPhase(active: ActivePomodoro, deadline: number) {
  const session = active.session;

  if (session.phase === "break") {
    const updated = dbUpdatePomodoroSession(session.id, {
      phase: "focus",
      ends_at: deadline + Math.max(1, session.duration_seconds),
    });
    if (!updated) {
      clearPomodoroTimer();
      return;
    }
    active.session = updated;
    notify("Break over — back to focus", updated.task ?? "Pomodoro");
    events.emitEvent("pomodoro:tick", {
      session: updated,
      phase: updated.phase,
      remaining: remainingSeconds(updated),
    });
    return;
  }

  const cyclesCompleted = session.cycles_completed + 1;
  if (cyclesCompleted >= session.cycles) {
    dbUpdatePomodoroSession(session.id, { cycles_completed: cyclesCompleted });
    completePomodoro("completed", true);
    return;
  }

  const breakSeconds = Math.max(0, session.break_seconds);
  const nextPhase: PomodoroPhase = breakSeconds > 0 ? "break" : "focus";
  const nextLength =
    nextPhase === "break"
      ? breakSeconds
      : Math.max(1, session.duration_seconds);
  const updated = dbUpdatePomodoroSession(session.id, {
    phase: nextPhase,
    ends_at: deadline + nextLength,
    cycles_completed: cyclesCompleted,
  });
  if (!updated) {
    clearPomodoroTimer();
    return;
  }
  active.session = updated;
  if (nextPhase === "break") {
    notify(
      "Focus done — take a break",
      updated.task
        ? `Completed a cycle of ${updated.task}`
        : "Focus cycle complete",
    );
  }
  events.emitEvent("pomodoro:tick", {
    session: updated,
    phase: updated.phase,
    remaining: remainingSeconds(updated),
  });
}

function pomodoroTick() {
  const active = activePomodoro;
  if (!active) return;
  const deadline = active.session.ends_at;
  if (deadline === null) {
    clearPomodoroTimer();
    return;
  }
  const now = nowSeconds();
  if (now < deadline) {
    events.emitEvent("pomodoro:tick", {
      session: active.session,
      phase: active.session.phase,
      remaining: remainingSeconds(active.session),
    });
    return;
  }
  if (now - deadline > POMODORO_STALE_OVERSHOOT_SECONDS) {
    completePomodoro("cancelled", false);
    return;
  }
  advancePomodoroPhase(active, deadline);
}

function armPomodoroTimer(session: PomodoroSessionRecord) {
  clearPomodoroTimer();
  activePomodoro = {
    session,
    interval: setInterval(pomodoroTick, POMODORO_TICK_MS),
  };
  events.emitEvent("pomodoro:tick", {
    session,
    phase: session.phase,
    remaining: remainingSeconds(session),
  });
}

/**
 * The single entry point for starting a session — used by both the widget and
 * the `start_pomodoro` tool, so a model-started timer really does tick, notify,
 * and open the widget rather than just landing a row in the database.
 */
export function startPomodoroSession(
  input: CreatePomodoroSessionInput,
): PomodoroSessionRecord {
  clearPomodoroTimer();
  cancelStalePomodoroSessions();
  const session = createPomodoroSession({
    ...input,
    duration_seconds:
      input.duration_seconds ??
      pomodoroSettingMinutes(POMODORO_SETTINGS.duration, 25, 1, 120) * 60,
    break_seconds:
      input.break_seconds ??
      pomodoroSettingMinutes(POMODORO_SETTINGS.break, 5, 0, 60) * 60,
  });
  armPomodoroTimer(session);
  events.emitEvent("pomodoro:started", session);
  return session;
}

/**
 * Reconcile the persisted session with reality at startup. Without this a row
 * left "running" by a quit or crash shows a frozen clock the UI cannot stop,
 * because pause/stop used to require an in-memory timer that no longer existed.
 */
export function recoverPomodoroSession() {
  const session = getActivePomodoroSession();
  if (!session) return;
  cancelStalePomodoroSessions(session.id);
  if (session.status === "paused") return; // resumable straight from the row
  const remaining =
    session.ends_at === null ? 0 : session.ends_at - nowSeconds();
  if (remaining <= 0) {
    dbStopPomodoroSession(session.id, "cancelled");
    return;
  }
  armPomodoroTimer(session);
}

export function startPomodoro(
  input: CreatePomodoroSessionInput,
): PomodoroSessionRecord {
  return startPomodoroSession(input);
}

export function pausePomodoro(): PomodoroSessionRecord | null {
  const session = activePomodoro?.session ?? getActivePomodoroSession();
  if (!session || session.status !== "running") return null;
  const paused = dbPausePomodoroSession(session.id, remainingSeconds(session));
  clearPomodoroTimer();
  return paused;
}

export function resumePomodoro(): PomodoroSessionRecord | null {
  const session = getActivePomodoroSession();
  if (!session || session.status !== "paused") return null;
  const resumed = dbResumePomodoroSession(session.id);
  if (!resumed) return null;
  armPomodoroTimer(resumed);
  return resumed;
}

export function stopPomodoro(): PomodoroSessionRecord | null {
  const session = activePomodoro?.session ?? getActivePomodoroSession();
  if (!session) return null;
  const stopped = dbStopPomodoroSession(session.id, "cancelled");
  clearPomodoroTimer();
  return stopped;
}

export function skipBreak(): PomodoroSessionRecord | null {
  const active = activePomodoro;
  if (!active || active.session.phase !== "break") return null;
  const updated = dbUpdatePomodoroSession(active.session.id, {
    phase: "focus",
    ends_at: nowSeconds() + Math.max(1, active.session.duration_seconds),
  });
  if (!updated) return null;
  active.session = updated;
  events.emitEvent("pomodoro:tick", {
    session: updated,
    phase: updated.phase,
    remaining: remainingSeconds(updated),
  });
  return updated;
}
