import { z } from "zod";
import { getActivePomodoroSession, listPomodoroSessions } from "@kotys/db";
import {
  startPomodoro,
  pausePomodoro,
  resumePomodoro,
  stopPomodoro,
  skipBreak,
} from "../services/pomodoro.js";
import { pub } from "./base.js";

const startInput = z.object({
  duration_seconds: z.number().optional(),
  break_seconds: z.number().optional(),
  chat_id: z.number().nullable().optional(),
  todo_id: z.number().nullable().optional(),
  task: z.string().nullable().optional(),
  cycles: z.number().optional(),
});

export const pomodoroRouter = {
  active: pub.handler(async () => getActivePomodoroSession()),

  sessions: pub
    .input(z.object({ limit: z.number().optional() }))
    .handler(async ({ input }) => listPomodoroSessions(input.limit)),

  start: pub
    .input(startInput)
    .handler(async ({ input }) => startPomodoro(input)),

  pause: pub.handler(async () => pausePomodoro()),

  resume: pub.handler(async () => resumePomodoro()),

  stop: pub.handler(async () => stopPomodoro()),

  skipBreak: pub.handler(async () => skipBreak()),
};
