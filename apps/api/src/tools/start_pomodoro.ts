import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import { startPomodoroSession } from "../services/pomodoro.js";
import type { ToolContext } from "./types.js";

export const definition: ToolDefinition = {
  type: "function",
  category: "task",
  function: {
    name: "start_pomodoro",
    description:
      "Start a Pomodoro focus timer. Use it when the user wants to focus on a task, start a timer, or work in intervals. The timer appears as a floating widget and sends notifications when focus and break periods end.",
    parameters: {
      type: "object",
      required: [],
      properties: {
        task: {
          type: "string",
          description: "Optional task name or goal for this Pomodoro session.",
        },
        duration_minutes: {
          type: "number",
          description:
            "Focus duration in minutes. Omit to use the user's configured default.",
        },
        break_minutes: {
          type: "number",
          description:
            "Break duration in minutes. Omit to use the user's configured default.",
        },
        cycles: {
          type: "number",
          description: "Number of focus/break cycles. Default 1.",
        },
        todo_id: {
          type: "number",
          description: "Optional linked todo/task id.",
        },
      },
    },
  },
};

// Left undefined rather than defaulted here: the main process fills the gap
// from the user's Pomodoro settings, so an unspecified duration honours their
// configured default instead of a number hardcoded in this file.
const positiveNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

export async function execute(
  args: ToolArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const task = typeof args.task === "string" ? args.task.trim() || null : null;
  const durationMinutes = positiveNumber(args.duration_minutes);
  const breakMinutes =
    typeof args.break_minutes === "number" &&
    Number.isFinite(args.break_minutes) &&
    args.break_minutes >= 0
      ? args.break_minutes
      : undefined;
  const cycles = positiveNumber(args.cycles) ?? 1;
  const todoId =
    typeof args.todo_id === "number" && args.todo_id > 0 ? args.todo_id : null;

  // Starts the real main-process timer, not just a database row: this is the
  // same entry point the widget uses, so the countdown, the notifications and
  // the widget all come up exactly as the description promises.
  const session = startPomodoroSession({
    chat_id: ctx.chatId,
    todo_id: todoId,
    task,
    duration_seconds:
      durationMinutes === undefined
        ? undefined
        : Math.round(durationMinutes * 60),
    break_seconds:
      breakMinutes === undefined ? undefined : Math.round(breakMinutes * 60),
    cycles: Math.round(cycles),
  });

  // Report what actually got scheduled, which may be the user's defaults
  // rather than anything the model asked for.
  const resolvedDuration = Math.round(session.duration_seconds / 60);
  const resolvedBreak = Math.round(session.break_seconds / 60);

  return {
    content: JSON.stringify({
      started: true,
      session: {
        id: session.id,
        task,
        duration_minutes: resolvedDuration,
        break_minutes: resolvedBreak,
        cycles: session.cycles,
      },
    }),
    activity: {
      query: task ?? "Pomodoro",
      results: [
        {
          title: `Started ${resolvedDuration}m Pomodoro${
            task ? `: ${task}` : ""
          }`,
          url: "",
        },
      ],
    },
  };
}
