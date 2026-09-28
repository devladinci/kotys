import { fmtChatTime } from "@kotys/contracts";

export type ChatBucket =
  "pinned" | "today" | "yesterday" | "week" | "month" | "earlier";

export function bucketFor(
  updatedAtSec: number,
  nowMs: number,
): Exclude<ChatBucket, "pinned"> {
  const dayMs = 86_400_000;
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const updatedAtMs = updatedAtSec * 1000;
  const age = startOfDay(nowMs) - startOfDay(updatedAtMs);
  if (age <= 0) return "today";
  if (age <= dayMs) return "yesterday";
  if (age <= 6 * dayMs) return "week";
  if (age <= 27 * dayMs) return "month";
  return "earlier";
}

export const CHAT_BUCKET_LABELS: Record<ChatBucket, string> = {
  pinned: "Pinned",
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  earlier: "Earlier",
};

const PAST_BUCKETS = ["yesterday", "week", "month", "earlier"] as const;

/**
 * Mirrors the desktop sidebar: past sections start collapsed while today's
 * group has more than one chat, and each header tap flips its own bucket.
 */
export function collapsedPastBuckets(
  counts: Partial<Record<Exclude<ChatBucket, "pinned">, number>>,
  expanded: ReadonlySet<Exclude<ChatBucket, "pinned">>,
): Set<Exclude<ChatBucket, "pinned">> {
  if ((counts.today ?? 0) <= 1) return new Set();
  return new Set(PAST_BUCKETS.filter((b) => !expanded.has(b)));
}

export const relTime = (tsSec: number, nowMs: number): string =>
  fmtChatTime(tsSec, nowMs);
