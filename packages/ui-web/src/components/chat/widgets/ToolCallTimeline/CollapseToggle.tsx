import { Wrench, ChevronDown } from "lucide-react";
import { formatDuration } from "../../toolDisplay";
import { TOGGLE_CLASSES, plural } from "./summaryShared";

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
