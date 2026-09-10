import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Wrench, ChevronDown } from "lucide-react";
import type { ToolActivity } from "@kotys/contracts";
import {
  describeTool,
  formatDuration,
  toolTone,
  type ToolTone,
} from "../toolDisplay";
import { useOverflowFlip, type HorizontalSide } from "../useOverflowFlip";
import { WidgetFor } from "./registry";

/** Warm-editorial timeline palette. Chip fill is a low-chroma tint of the
 * family hue; the -ink variant is the icon color drawn on top. Both themes
 * resolve through CSS vars so dark/light never drift apart. */
const TONE_CLASSES: Record<ToolTone, string> = {
  web: "bg-tl-web",
  read: "bg-tl-read",
  write: "bg-tl-write",
  shell: "bg-tl-shell",
  memory: "bg-tl-memory",
  task: "bg-tl-task",
  chat: "bg-tl-chat",
  mcp: "bg-tl-mcp",
};

/** Icon color per tone — same hue family as the chip, darkened to ink so the
 * icons stop competing with the segments. */
const TONE_TEXT: Record<ToolTone, string> = {
  web: "text-tl-web-ink",
  read: "text-tl-read-ink",
  write: "text-tl-write-ink",
  shell: "text-tl-shell-ink",
  memory: "text-tl-memory-ink",
  task: "text-tl-task-ink",
  chat: "text-tl-chat-ink",
  mcp: "text-tl-mcp-ink",
};

const ERROR_CLASS = "bg-tl-error";
const ERROR_TEXT = "text-tl-error-ink";

// Model time is the majority of the bar, so it gets a calm solid tint —
// a hatched pattern at this size reads as noise. Uses the dedicated LLM
// ground (clearly darker than the message surface in both themes) instead of
// borrowing the user-bubble color.
const LLM_CLASS = "bg-surface-llm";

const MIN_WIDTH_PX = 3;
const FLIP_UNDER_Y = 230;

type Segment =
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
      /** Which tool call this generation round produced; -1 = leading. */
      after: number;
      running: boolean;
    };

/**
 * Lays the whole turn out on one axis: LLM generation fills the time between
 * turn start, each tool call, and the turn's end.
 */
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

function DetailBody({
  tc,
  durationMs,
}: {
  tc: ToolActivity;
  durationMs: number;
}) {
  const { Icon, label, server } = describeTool(tc);
  const params: [string, string | undefined][] = [
    ["server", tc.server],
    ["query", tc.query],
    ["url", tc.url],
    ["file", tc.filePath],
  ];
  const shown = params.filter(([, v]) => !!v);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-text">
        <Icon size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
        {server && (
          <span className="shrink-0 rounded bg-surface-2 border border-border px-1 text-[10px] leading-4 text-text-muted">
            {server}
          </span>
        )}
        {tc.status === "running" && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-accent animate-pulse">
            running
          </span>
        )}
        {tc.status === "error" && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-red-400">
            failed
          </span>
        )}
      </div>
      {shown.length > 0 && (
        <dl className="mt-1.5 space-y-0.5 text-[11px] leading-4">
          {shown.map(([key, value]) => (
            <div key={key} className="flex gap-1.5">
              <dt className="shrink-0 text-text-muted/70">{key}</dt>
              <dd className="text-text-muted break-all min-w-0">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {tc.results && tc.results.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-l-2 border-border pl-2">
          {tc.results.map((r, j) => (
            <li key={j} className="text-[11px] text-text-muted truncate">
              {r.title || r.url}
              {r.url ? <span className="opacity-60"> — {r.url}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {tc.status === "error" && tc.error && (
        <div className="mt-1.5 border-l-2 border-red-400/60 pl-2 text-[11px] text-red-400 break-all">
          {tc.error}
        </div>
      )}
      {durationMs > 0 && (
        <div className="mt-1.5 text-[10px] text-text-muted/70">
          {formatDuration(durationMs)}
        </div>
      )}
    </div>
  );
}

function hoverCardStyle(
  rect: DOMRect,
  side: HorizontalSide,
): React.CSSProperties {
  const below = rect.top < FLIP_UNDER_Y;
  const vertical = below
    ? { top: rect.bottom + 8 }
    : { bottom: window.innerHeight - rect.top + 8 };
  const horizontal =
    side === "center"
      ? { left: rect.left + rect.width / 2, transform: "translateX(-50%)" }
      : side === "right"
        ? { right: 8 }
        : { left: 8 };
  return {
    position: "fixed",
    maxWidth: 320,
    zIndex: 50,
    ...vertical,
    ...horizontal,
  };
}

/** Floating hover card, rendered in a portal so nothing on the page moves. */
function HoverCard({
  children,
  rect,
}: {
  children: React.ReactNode;
  rect: DOMRect;
}) {
  const [ref, side] = useOverflowFlip<HTMLDivElement>(true);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={hoverCardStyle(rect, side)}
      className="pointer-events-none rounded-lg border border-border bg-surface shadow-lg p-2.5 text-left"
    >
      {children}
    </div>,
    document.body,
  );
}

/** Re-renders on an interval while a call runs, so its segment (and the
 * trailing generation span) visibly grow. Returns epoch ms of the last tick. */
function useRunningTicker(calls: ToolActivity[], isStreaming: boolean): number {
  const hasRunning =
    isStreaming || calls.some((tc) => tc?.status === "running");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!hasRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [hasRunning]);
  return now;
}

const MIN_ICON_WIDTH_PX = 16;
const INSET_WIDTH_PX = 26;
const GROW_IN_MS = 2500;
const GROW_TICK_MS = 500;

/** Tracks the timeline's rendered width so per-segment pixel widths are
 * known — an icon fits or it doesn't, regardless of how the ms split. */
function useTrackWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // jsdom (and some old webviews) have no ResizeObserver; the bar then
    // just always renders icons and lets overflow-hidden clip.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** One segment of the timeline. Mounts as a small icon pill, then its
 * background eases out to its true share of the bar. */
function TimelineSegment({
  segment,
  pxWidth,
  active,
  onHover,
  onLeave,
}: {
  segment: Segment;
  pxWidth: number | null;
  active: boolean;
  onHover: (rect: DOMRect) => void;
  onLeave: () => void;
}) {
  const s = segment;
  const isLlm = s.kind === "llm";
  const [grown, setGrown] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!grown) return;
    const t = window.setTimeout(() => setSettled(true), GROW_IN_MS + 100);
    return () => window.clearTimeout(t);
  }, [grown]);

  const tone = s.kind === "tool" ? toolTone(s.tc) : null;
  const { Icon, label } =
    s.kind === "tool" ? describeTool(s.tc) : { Icon: null, label: null };
  const llmLabel = isLlm
    ? s.running
      ? "Model is generating…"
      : s.after < 0
        ? "Model thought before calling tools"
        : "Model generated between calls"
    : null;
  const showIcon =
    (pxWidth === null || !grown || pxWidth >= MIN_ICON_WIDTH_PX) &&
    (s.kind === "tool" ? !!Icon : true);

  return (
    <button
      type="button"
      aria-label={isLlm ? llmLabel! : label!}
      title={isLlm ? llmLabel! : label!}
      onMouseEnter={(e) => onHover(e.currentTarget.getBoundingClientRect())}
      onFocus={(e) => onHover(e.currentTarget.getBoundingClientRect())}
      onBlur={onLeave}
      onMouseLeave={onLeave}
      style={{
        // LLM spans compress (ms^0.75) so long generation waits don't push
        // tool segments into slivers; the summary line stays on real times.
        flexGrow: grown
          ? s.kind === "llm"
            ? Math.max(Math.pow(Math.max(s.ms, 1), 0.75), 1)
            : Math.max(s.ms, 1)
          : 0.0001,
        flexBasis: 0,
        minWidth: grown ? MIN_WIDTH_PX : INSET_WIDTH_PX,
        transitionProperty: "flex-grow, min-width",
        transitionDuration: `${settled ? GROW_TICK_MS : GROW_IN_MS}ms`,
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      className={`relative h-full flex items-center justify-start pl-3 overflow-hidden ${
        isLlm
          ? LLM_CLASS
          : s.tc.status === "error"
            ? ERROR_CLASS
            : TONE_CLASSES[tone!]
      } ${s.kind === "tool" && s.tc.status === "running" ? "animate-pulse" : ""} ${
        isLlm && s.running ? "animate-pulse" : ""
      } ${active ? "brightness-125" : ""}`}
    >
      {s.kind === "tool" && Icon && showIcon && (
        <Icon
          size={12}
          strokeWidth={2}
          fill="none"
          className={`shrink-0 relative ${
            s.tc.status === "error" ? ERROR_TEXT : TONE_TEXT[tone!]
          }`}
        />
      )}
      {isLlm && showIcon && (
        <Sparkles
          size={12}
          strokeWidth={2}
          fill="none"
          className="shrink-0 relative text-text-muted"
        />
      )}
    </button>
  );
}

function ToolCallTimeline({
  calls: raw,
  isStreaming = false,
}: {
  calls: ToolActivity[];
  isStreaming?: boolean;
}) {
  // Tool events can arrive with index gaps; drop holes before indexing.
  const calls = raw.filter(Boolean);
  // The strip renders by default; the collapsed line is opt-in via the
  // summary toggle above the bar.
  const [expanded, setExpanded] = useState(true);
  const [preview, setPreview] = useState<{
    segment: Segment;
    rect: DOMRect;
  } | null>(null);
  const now = useRunningTicker(calls, isStreaming);
  const [trackRef, trackWidth] = useTrackWidth();

  const segments = buildSegments(calls, now, isStreaming);
  const toolTime = calls.reduce((sum, tc) => sum + (tc?.durationMs ?? 0), 0);
  const totalTime =
    segments.length > 0 ? segments.reduce((sum, s) => sum + s.ms, 0) : 0;

  if (calls.length === 0) return null;

  const live = isStreaming || calls.some((tc) => tc?.status === "running");

  // Collapsed: one quiet summary line. The colored strip earns its space only
  // when the user asks for detail — or the turn is still in flight.
  if (!expanded && !live) {
    return (
      <div className="mb-2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          title="Show the tool timeline"
          className="inline-flex items-center gap-1 text-[10px] text-text-muted/70 hover:text-text-muted transition rounded px-1 -mx-1 py-0.5 hover:bg-surface-2"
        >
          <Wrench size={10} />
          {`${calls.length} tool${calls.length === 1 ? "" : "s"} · ${formatDuration(totalTime)}`}
        </button>
        {calls.map((tc, i) =>
          tc?.widget && tc.textOffset === undefined ? (
            <WidgetFor key={i} widget={tc.widget} />
          ) : null,
        )}
      </div>
    );
  }

  return (
    <div className="mb-2">
      {!live && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded
          title="Hide the tool timeline"
          className="mb-1 inline-flex items-center gap-1 text-[10px] text-text-muted/70 hover:text-text-muted transition rounded px-1 -mx-1 py-0.5 hover:bg-surface-2"
        >
          <Wrench size={10} />
          {`${calls.length} tool${calls.length === 1 ? "" : "s"} · ${formatDuration(totalTime)}`}
          <ChevronDown size={9} className="rotate-180" />
        </button>
      )}
      <div
        ref={trackRef}
        className="flex w-full h-4 overflow-hidden rounded-full bg-surface-2/70"
      >
        {segments.map((s) => {
          const pxWidth =
            trackWidth !== null && totalTime > 0
              ? (trackWidth * s.ms) / totalTime
              : null;
          return (
            <TimelineSegment
              key={s.key}
              segment={s}
              pxWidth={pxWidth}
              active={preview?.segment.key === s.key}
              onHover={(rect) => setPreview({ segment: s, rect })}
              onLeave={() => setPreview(null)}
            />
          );
        })}
      </div>
      {totalTime > 0 && (
        <div className="mt-1 text-[10px] text-text-muted/70">{`${
          calls.length
        } tool${calls.length === 1 ? "" : "s"} · ${formatDuration(
          totalTime,
        )} total · ${formatDuration(toolTime)} in tools`}</div>
      )}
      {preview && (
        <HoverCard rect={preview.rect}>
          {preview.segment.kind === "tool" ? (
            <DetailBody
              tc={preview.segment.tc}
              durationMs={preview.segment.ms}
            />
          ) : (
            <div className="text-xs text-text">
              {preview.segment.running
                ? "Model is generating…"
                : preview.segment.after < 0
                  ? "Model thinking"
                  : "Model generation"}
              <div className="mt-1 text-[10px] text-text-muted/70">
                {formatDuration(preview.segment.ms)}
              </div>
            </div>
          )}
        </HoverCard>
      )}
      {calls.map((tc, i) =>
        tc?.widget && tc.textOffset === undefined ? (
          <WidgetFor key={i} widget={tc.widget} />
        ) : null,
      )}
    </div>
  );
}

export default ToolCallTimeline;
