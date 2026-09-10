import { Wrench, ChevronDown } from "lucide-react";
import { formatDuration } from "../../toolDisplay";
import { VISIBLE_TOOL_CALLS } from "./model";

const plural = (n: number) => (n === 1 ? "" : "s");

const TOGGLE_CLASSES =
  "inline-flex items-center gap-1 text-[10px] text-text-muted/70 hover:text-text-muted transition rounded px-1 -mx-1 py-0.5 hover:bg-surface-2";

interface ICollapseToggleProps {
  count: number;
  totalMs: number;
  onCollapse: () => void;
}

export function CollapseToggle({
  count,
  totalMs,
  onCollapse,
}: ICollapseToggleProps) {
  return (
    <button
      type="button"
      onClick={onCollapse}
      aria-expanded
      title="Hide the tool timeline"
      className={`mb-1 ${TOGGLE_CLASSES}`}
    >
      <Wrench size={10} />
      {`${count} tool${plural(count)} · ${formatDuration(totalMs)}`}
      <ChevronDown size={9} className="rotate-180" />
    </button>
  );
}

interface ICountsLineProps {
  count: number;
  totalMs: number;
  toolMs: number;
  overflowCount: number;
}

export function CountsLine({
  count,
  totalMs,
  toolMs,
  overflowCount,
}: ICountsLineProps) {
  if (totalMs <= 0) return null;
  return (
    <div className="mt-1 text-[10px] text-text-muted/70">
      {`${count} tool${plural(count)}${
        overflowCount > 0 ? ` (showing last ${VISIBLE_TOOL_CALLS})` : ""
      } · ${formatDuration(totalMs)} total · ${formatDuration(toolMs)} in tools`}
    </div>
  );
}

interface ICollapsedSummaryProps {
  count: number;
  totalMs: number;
  overflowCount: number;
  onExpand: () => void;
}

export function CollapsedSummary({
  count,
  totalMs,
  overflowCount,
  onExpand,
}: ICollapsedSummaryProps) {
  return (
    <>
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={false}
        title="Show the tool timeline"
        className={TOGGLE_CLASSES}
      >
        <Wrench size={10} />
        {`${count} tool${plural(count)} · ${formatDuration(totalMs)}`}
      </button>
      {overflowCount > 0 && (
        <span className="ml-2 text-[10px] text-text-muted/40">
          (+{overflowCount} earlier)
        </span>
      )}
    </>
  );
}
