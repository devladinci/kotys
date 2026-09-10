import { memo } from "react";
import type { TodoPriority } from "@kotys/contracts";

const DOT: Record<TodoPriority, string> = {
  low: "bg-emerald-400",
  medium: "bg-amber-400",
  high: "bg-red-400",
};

interface IProps {
  priority: TodoPriority;
  className?: string;
}

function TodoPriorityBadgeBase({ priority, className = "" }: IProps) {
  // `medium` is the default every task gets, so badging it says nothing and
  // puts a coloured dot on every row. Only a deliberate priority is worth ink.
  if (priority === "medium") return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] text-text-muted ${className}`}
      title={`${priority} priority`}
    >
      <span className={`w-2 h-2 rounded-full ${DOT[priority]}`} />
      <span className="capitalize">{priority}</span>
    </span>
  );
}

const TodoPriorityBadge = memo(TodoPriorityBadgeBase);
export default TodoPriorityBadge;
