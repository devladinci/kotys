import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DividerData } from "./rows";

interface IProps {
  data: DividerData;
}

export function Divider({ data }: IProps) {
  const [open, setOpen] = useState(false);
  const count = data.summarizedCount > 0 ? ` (${data.summarizedCount})` : "";

  const handleToggle = () => setOpen((isOpen) => !isOpen);
  return (
    <div className="py-2 px-6 flex flex-col items-center gap-1">
      <div className="w-full flex items-center gap-3 text-xs text-text-muted">
        <div className="flex-1 border-t border-border" />
        {data.summaryText ? (
          <button
            onClick={handleToggle}
            className="flex items-center gap-1 hover:text-text transition"
            aria-expanded={open}
            title="Show the conversation summary"
          >
            <ChevronDown
              size={12}
              className={`transition ${open ? "rotate-180" : ""}`}
            />
            {data.summarizedCount} earlier message{count === "" ? "" : "s"}{" "}
            summarized
          </button>
        ) : (
          "earlier messages summarized"
        )}
        <div className="flex-1 border-t border-border" />
      </div>
      {open && data.summaryText && (
        <div className="w-full max-w-2xl max-h-56 overflow-y-auto scrollbar-thin rounded-lg bg-surface-2 border border-border p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap text-text-muted text-left">
          {data.summaryText}
        </div>
      )}
    </div>
  );
}
