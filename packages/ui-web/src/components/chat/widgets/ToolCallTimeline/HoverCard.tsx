import { createPortal } from "react-dom";
import type { ToolActivity } from "@kotys/contracts";
import { describeTool, formatDuration } from "../../toolDisplay";
import { useOverflowFlip, type HorizontalSide } from "../../useOverflowFlip";
import type { Segment } from "./model";

const FLIP_UNDER_Y = 230;

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

interface IToolDetailBodyProps {
  tc: ToolActivity;
  durationMs: number;
}

function ToolDetailBody({ tc, durationMs }: IToolDetailBodyProps) {
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

interface ILlmDetailBodyProps {
  ms: number;
  running: boolean;
  after: number;
}

function LlmDetailBody({ ms, running, after }: ILlmDetailBodyProps) {
  return (
    <div className="text-xs text-text">
      {running
        ? "Model is generating…"
        : after < 0
          ? "Model thinking"
          : "Model generation"}
      <div className="mt-1 text-[10px] text-text-muted/70">
        {formatDuration(ms)}
      </div>
    </div>
  );
}

interface IHoverCardProps {
  children: React.ReactNode;
  rect: DOMRect;
}

export function HoverCard({ children, rect }: IHoverCardProps) {
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

interface ISegmentDetailBodyProps {
  segment: Segment;
}

export function SegmentDetailBody({ segment }: ISegmentDetailBodyProps) {
  return segment.kind === "tool" ? (
    <ToolDetailBody tc={segment.tc} durationMs={segment.ms} />
  ) : (
    <LlmDetailBody
      ms={segment.ms}
      running={segment.running}
      after={segment.after}
    />
  );
}
