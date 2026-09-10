import { epochToDate, toMillis, type EpochSeconds } from "@kotys/contracts";

export function fmtHistoryDate(startedAtSec: number): string {
  const d = epochToDate(toMillis(startedAtSec as EpochSeconds));
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function fmtElapsed(durationSeconds: number): string {
  return `${Math.round(durationSeconds / 60)}m`;
}
