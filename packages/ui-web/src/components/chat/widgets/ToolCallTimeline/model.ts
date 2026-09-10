import type { ToolActivity } from "@kotys/contracts";

export const VISIBLE_TOOL_CALLS = 15;

export type Segment =
  | {
      kind: "tool";
      key: string;
      ms: number;
      tc: ToolActivity;
    }
  | {
      kind: "llm";
      key: string;
      ms: number;
      after: number;
      running: boolean;
    };

export type Page = { segments: Segment[]; total: number };

function buildSegments(
  calls: ToolActivity[],
  now: number,
  isStreaming: boolean,
): Segment[] {
  const segments: Segment[] = [];
  const first = calls[0];
  if (!first) return [];

  const turnStart =
    first.turnStartedAt ??
    first.startedAt ??
    (first.endedAt ?? now) - (first.durationMs ?? 0);
  const callEnd = (tc: ToolActivity) =>
    tc.endedAt ??
    (tc.startedAt ? tc.startedAt + (tc.durationMs ?? 0) : undefined) ??
    (tc.status === "running" ? now : turnStart);
  const callStart = (tc: ToolActivity) =>
    tc.startedAt ?? callEnd(tc) - (tc.durationMs ?? 0);

  const lead = (first.startedAt ?? turnStart) - turnStart;
  if (lead > 0) {
    segments.push({
      kind: "llm",
      key: "llm-lead",
      ms: lead,
      after: -1,
      running: false,
    });
  }

  calls.forEach((tc, i) => {
    const running = tc.status === "running";
    const ms = running
      ? Math.max(tc.startedAt ? now - tc.startedAt : 0, 0)
      : (tc.durationMs ?? 0);
    segments.push({ kind: "tool", key: `tool-${i}`, ms, tc });
    if (running) return;

    const next = calls[i + 1];
    const gapEnd = next
      ? (next.startedAt ?? callStart(next))
      : isStreaming || !tc.turnEndedAt
        ? now
        : tc.turnEndedAt;
    const gap = gapEnd - (callEnd(tc) || 0);
    if (gap > 0) {
      segments.push({
        kind: "llm",
        key: `llm-${i}`,
        ms: gap,
        after: i,
        running: next === undefined && (isStreaming || !tc.turnEndedAt),
      });
    }
  });
  return segments;
}

export function buildPages(
  calls: ToolActivity[],
  now: number,
  isStreaming: boolean,
): Page[] {
  const pages: Page[] = [];
  let current: Segment[] = [];
  let toolsInPage = 0;
  const push = () => {
    if (current.length === 0) return;
    pages.push({
      segments: current,
      total: current.reduce((sum, s) => sum + s.ms, 0),
    });
    current = [];
  };

  for (const s of buildSegments(calls, now, isStreaming)) {
    if (s.kind === "tool" && toolsInPage === VISIBLE_TOOL_CALLS) {
      // The gap before this call opens the next page so time stays
      // continuous across the seam.
      const lead =
        current.length > 0 && current[current.length - 1].kind === "llm"
          ? current.pop()!
          : null;
      push();
      current = lead ? [lead] : [];
      toolsInPage = 0;
    }
    if (s.kind === "tool") toolsInPage++;
    current.push(s);
  }
  push();
  return pages;
}
