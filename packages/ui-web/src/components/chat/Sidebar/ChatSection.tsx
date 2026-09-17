import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface IProps {
  label: string;
  count: number;
  isCollapsed: boolean;
  onToggle: (label: string) => void;
  children: ReactNode;
}

export function ChatSection({
  label,
  count,
  isCollapsed,
  onToggle,
  children,
}: IProps) {
  const handleToggle = () => onToggle(label);

  return (
    <div>
      {/* Sticky, so the bucket a row belongs to stays readable while scrolling. */}
      <button
        onClick={handleToggle}
        aria-expanded={!isCollapsed}
        className="sticky top-0 z-10 flex w-full items-center gap-1 bg-bg px-2.5 pb-1 pt-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/70 transition-colors hover:text-text-muted"
      >
        <span>{label}</span>
        <ChevronDown
          size={11}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ${
            isCollapsed ? "-rotate-90" : ""
          }`}
        />
        <span className="flex-1" />
        {/* Kept in flow but faded, so the header width doesn't jump on toggle. */}
        <span
          aria-hidden={!isCollapsed}
          className={`normal-case tracking-normal text-text-muted/50 transition-opacity duration-200 ${
            isCollapsed ? "opacity-100" : "opacity-0"
          }`}
        >
          {count}
        </span>
      </button>
      {/* grid-template-rows 0fr→1fr animates height without measuring
          content; rows stay mounted but inert, so keyboard focus can't land
          inside a collapsed section. */}
      <div
        inert={isCollapsed}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
