import type { EpochSeconds } from "../constants/epoch.js";

export type PomodoroStatus = "running" | "paused" | "completed" | "cancelled";
export type PomodoroPhase = "focus" | "break";

export type PomodoroSessionRecord = {
  id: number;
  chat_id: number | null;
  todo_id: number | null;
  task: string | null;
  duration_seconds: number;
  break_seconds: number;
  started_at: EpochSeconds;
  ended_at: number | null;
  completed_at: number | null;
  status: PomodoroStatus;
  phase: PomodoroPhase;
  ends_at: number | null;
  cycles: number;
  cycles_completed: number;
  updated_at: number;
  remaining_at_pause: number | null;
};

export type CreatePomodoroSessionInput = {
  chat_id?: number | null;
  todo_id?: number | null;
  task?: string | null;
  duration_seconds?: number;
  break_seconds?: number;
  cycles?: number;
};
