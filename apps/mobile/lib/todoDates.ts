import {
  asEpochSeconds,
  epochToDate,
  toMillis,
  type EpochSeconds,
} from "@kotys/contracts";

export function fromLocalInput(v: string): EpochSeconds | null {
  if (!v) return null;
  const ts = new Date(v).getTime();
  return Number.isNaN(ts) ? null : asEpochSeconds(Math.floor(ts / 1000));
}

export function toLocalInput(ts: EpochSeconds | null): string {
  if (ts === null) return "";
  const d = epochToDate(toMillis(ts));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
