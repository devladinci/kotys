import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { describeTool, toolTone } from "../../toolDisplay";
import {
  ERROR_CLASS,
  ERROR_TEXT,
  LLM_CLASS,
  TONE_CLASSES,
  TONE_TEXT,
} from "./palette";
import type { Segment } from "./model";

const MIN_WIDTH_PX = 3;
const MIN_ICON_WIDTH_PX = 16;
const INSET_WIDTH_PX = 26;
const GROW_IN_MS = 2500;
const GROW_TICK_MS = 500;

function llmLabel(s: Segment & { kind: "llm" }): string {
  return s.running
    ? "Model is generating…"
    : s.after < 0
      ? "Model thought before calling tools"
      : "Model generated between calls";
}

interface IProps {
  segment: Segment;
  pxWidth: number | null;
  active: boolean;
  onHover: (rect: DOMRect) => void;
  onLeave: () => void;
}

export function TimelineSegment({
  segment,
  pxWidth,
  active,
  onHover,
  onLeave,
}: IProps) {
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
  const title = isLlm ? llmLabel(s) : label!;
  const showIcon =
    (pxWidth === null || !grown || pxWidth >= MIN_ICON_WIDTH_PX) &&
    (s.kind === "tool" ? !!Icon : true);

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onMouseEnter={(e) => onHover(e.currentTarget.getBoundingClientRect())}
      onFocus={(e) => onHover(e.currentTarget.getBoundingClientRect())}
      onBlur={onLeave}
      onMouseLeave={onLeave}
      style={{
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
