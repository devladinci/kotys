import { memo } from "react";
import { Bell, CalendarClock } from "lucide-react";

interface IProps {
  icon: "due" | "remind";
  /** Pre-formatted label — see dueLabelFor / reminderLabelFor. */
  label: string;
  /** Full date on hover, since the label is deliberately abbreviated. */
  title?: string | null;
  overdue?: boolean;
  className?: string;
}

function TodoDateChipBase({
  icon,
  label,
  title,
  overdue = false,
  className = "",
}: IProps) {
  const Icon = icon === "due" ? CalendarClock : Bell;
  return (
    <span
      title={title ?? undefined}
      className={`inline-flex items-center gap-1 text-[11px] ${
        overdue ? "text-red-400" : "text-text-muted"
      } ${className}`}
    >
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}

const TodoDateChip = memo(TodoDateChipBase);
export default TodoDateChip;
