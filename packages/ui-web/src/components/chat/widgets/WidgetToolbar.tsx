import { Code2, Eye } from "lucide-react";
import CopyTextButton from "../../CopyTextButton";

export default function WidgetToolbar({
  showSource,
  onToggle,
  source,
}: {
  showSource: boolean;
  onToggle: () => void;
  source: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1 border-t border-border bg-surface px-2 py-1">
      <button
        onClick={onToggle}
        title={showSource ? "Show widget" : "Show source"}
        aria-label={showSource ? "Show widget" : "Show source"}
        className="p-1 rounded text-text-muted hover:text-text transition"
      >
        {showSource ? <Eye size={13} /> : <Code2 size={13} />}
      </button>
      <CopyTextButton text={source} />
    </div>
  );
}
