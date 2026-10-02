const FULL_PCT = 90;
const HIGH_PCT = 75;

export type UsageLevel = "normal" | "high" | "full";

export function usageLevel(pct: number): UsageLevel {
  if (pct >= FULL_PCT) return "full";
  if (pct >= HIGH_PCT) return "high";
  return "normal";
}
