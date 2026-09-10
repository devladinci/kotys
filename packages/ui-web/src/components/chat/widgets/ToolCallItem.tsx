import { memo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ToolActivity } from "@kotys/contracts";
import { describeTool } from "../toolDisplay";
import FileActions from "./FileActions";
import { WidgetFor } from "./registry";

const ToolCallItem = memo(function ToolCallItem({ tc }: { tc: ToolActivity }) {
  const [open, setOpen] = useState(false);
  const running = tc.status === "running";
  const expandable = (tc.results?.length ?? 0) > 0 || !!tc.error;

  if (tc.widget) return <WidgetFor widget={tc.widget} />;

  const { Icon, label, server } = describeTool(tc);

  const isFileTool =
    tc.tool === "write_file" ||
    tc.tool === "apply_patch" ||
    tc.tool === "read_file";

  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition">
        <button
          onClick={() => expandable && setOpen((o) => !o)}
          aria-expanded={open}
          className={`flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition ${
            running ? "animate-pulse" : ""
          }`}
        >
          <Icon size={13} className="shrink-0" />
          {server && (
            <span className="shrink-0 rounded bg-surface-2 border border-border px-1 text-[10px] leading-4 text-text-muted">
              {server}
            </span>
          )}
          <span className="truncate max-w-md">{label}</span>
          {tc.status === "error" && (
            <span className="text-red-400">failed</span>
          )}
          {expandable && (
            <ChevronDown size={12} className={open ? "" : "-rotate-90"} />
          )}
        </button>
        {!running && isFileTool && tc.filePath && (
          <FileActions filePath={tc.filePath} />
        )}
      </div>
      {open && tc.results && tc.results.length > 0 && (
        <ul className="mt-1.5 mb-1 pl-3 border-l-2 border-border space-y-1">
          {tc.results.map((r, j) => (
            <li key={j} className="text-xs text-text-muted truncate">
              {r.title || r.url}
              {r.url ? <span className="opacity-60"> — {r.url}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {open && tc.status === "error" && tc.error && (
        <div className="mt-1.5 mb-1 pl-3 border-l-2 border-border text-xs text-red-400">
          {tc.error}
        </div>
      )}
    </div>
  );
});

export default ToolCallItem;
