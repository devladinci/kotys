import { useState } from "react";
import type { ToolActivity } from "@kotys/contracts";
import { WidgetFor } from "../registry";
import { buildPages, VISIBLE_TOOL_CALLS, type Segment } from "./model";
import { useRunningTicker } from "./useRunningTicker";
import { useScrollFollow } from "./useScrollFollow";
import { useTrackWidth } from "./useTrackWidth";
import { TimelineSegment } from "./TimelineSegment";
import { HoverCard } from "./HoverCard";
import { SegmentDetailBody } from "./SegmentDetailBody";
import { CollapsedSummary } from "./CollapsedSummary";
import { CollapseToggle } from "./CollapseToggle";
import { CountsLine } from "./CountsLine";

interface IProps {
  calls: ToolActivity[];
  isStreaming?: boolean;
}

export default function ToolCallTimeline({
  calls: raw,
  isStreaming = false,
}: IProps) {
  const calls = raw.filter(Boolean);
  const [expanded, setExpanded] = useState(true);
  const [preview, setPreview] = useState<{
    segment: Segment;
    rect: DOMRect;
  } | null>(null);
  const now = useRunningTicker(calls, isStreaming);
  const [trackRef, trackWidth] = useTrackWidth();
  const overflowCount = Math.max(calls.length - VISIBLE_TOOL_CALLS, 0);
  const resetFollow = useScrollFollow(trackRef, overflowCount > 0);

  const pages = buildPages(calls, now, isStreaming);
  const toolTime = calls.reduce((sum, tc) => sum + (tc?.durationMs ?? 0), 0);
  const totalTime = pages.reduce((sum, p) => sum + p.total, 0);

  if (calls.length === 0) return null;

  const live = isStreaming || calls.some((tc) => tc?.status === "running");
  const hasOverflow = overflowCount > 0;
  const widgets = calls.map((tc) => {
    if (!tc?.widget || tc.textOffset !== undefined) return null;
    const widgetKey =
      tc.widget.kind === "todo"
        ? `todo-${tc.widget.id}`
        : tc.widget.kind === "image"
          ? `image-${tc.tool}-${tc.startedAt ?? ""}`
          : `input-${tc.widget.title}`;
    return <WidgetFor key={widgetKey} widget={tc.widget} />;
  });

  if (!expanded && !live) {
    return (
      <div className="mb-2">
        <CollapsedSummary
          count={calls.length}
          totalMs={totalTime}
          overflowCount={overflowCount}
          onExpand={() => setExpanded(true)}
        />
        {widgets}
      </div>
    );
  }

  return (
    <div className="mb-2">
      {!live && (
        <CollapseToggle
          count={calls.length}
          totalMs={totalTime}
          onCollapse={() => {
            resetFollow();
            setExpanded(false);
          }}
        />
      )}
      <div
        ref={trackRef}
        onWheel={(e) => {
          if (e.deltaY !== 0 && hasOverflow && e.currentTarget.scrollBy) {
            e.currentTarget.scrollBy({ left: e.deltaY });
            e.preventDefault();
          }
        }}
        className="flex h-4 overflow-x-auto overflow-y-hidden scrollbar-none rounded-full bg-surface-2/70"
      >
        {pages.map((page) => (
          <div
            key={page.segments[0]?.key}
            className="flex h-full w-full shrink-0"
          >
            {page.segments.map((s) => (
              <TimelineSegment
                key={s.key}
                segment={s}
                pxWidth={
                  trackWidth !== null && page.total > 0
                    ? (trackWidth * s.ms) / page.total
                    : null
                }
                active={preview?.segment.key === s.key}
                onHover={(rect) => setPreview({ segment: s, rect })}
                onLeave={() => setPreview(null)}
              />
            ))}
          </div>
        ))}
      </div>
      <CountsLine
        count={calls.length}
        totalMs={totalTime}
        toolMs={toolTime}
        overflowCount={overflowCount}
      />
      {preview && (
        <HoverCard rect={preview.rect}>
          <SegmentDetailBody segment={preview.segment} />
        </HoverCard>
      )}
      {widgets}
    </div>
  );
}
