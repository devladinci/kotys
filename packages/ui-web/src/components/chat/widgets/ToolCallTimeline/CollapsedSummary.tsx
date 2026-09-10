import { Wrench } from "lucide-react";
import { formatDuration } from "../../toolDisplay";
import { TOGGLE_CLASSES, plural } from "./summaryShared";

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
