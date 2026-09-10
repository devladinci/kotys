import { formatDuration } from "../../toolDisplay";
import { VISIBLE_TOOL_CALLS } from "./model";
import { plural } from "./summaryShared";

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
