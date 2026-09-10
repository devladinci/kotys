import type { ToolDefinition, ToolArgs, ToolResult } from "@kotys/contracts";
import type { ToolContext } from "./types.js";

export const definition: ToolDefinition = {
  type: "function",
  category: "system",
  function: {
    name: "current_datetime",
    description:
      "Get the current local date, time, weekday, and timezone. Use whenever the user refers to now, today, or asks anything time-dependent.",
    parameters: { type: "object", properties: {} },
  },
};

export async function execute(
  _args: ToolArgs,
  _ctx: ToolContext,
): Promise<ToolResult> {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const local = now.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "medium",
  });
  return {
    content: JSON.stringify({ iso: now.toISOString(), local, timezone }),
    activity: { results: [{ title: `${local} (${timezone})`, url: "" }] },
  };
}
