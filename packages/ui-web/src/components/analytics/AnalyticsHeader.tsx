import {
  ArrowLeft,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
} from "lucide-react";
import { useTodoStore } from "@kotys/core";

export function AnalyticsHeader({
  onBack,
  onRefresh,
}: {
  onBack: () => void;
  onRefresh: () => void;
}) {
  const railOpen = useTodoStore((s) => s.sidebarOpen);

  return (
    <header
      className="pt-10 px-6 pb-3 border-b border-border bg-surface flex items-center gap-3 flex-shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <button
        onClick={onBack}
        aria-label="Back to chat"
        title="Back to chat (Esc)"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-border text-xs transition"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <ArrowLeft size={14} />
        Back
      </button>
      <h1 className="flex-1 min-w-0 text-sm font-semibold truncate">
        Analytics
      </h1>
      {/* The rail holds Focus and Tasks, mirroring the ChatView panel toggle. */}
      <button
        onClick={() => useTodoStore.getState().setSidebarOpen(!railOpen)}
        aria-label={railOpen ? "Hide side panel" : "Show side panel"}
        aria-expanded={railOpen}
        title={railOpen ? "Hide side panel (⌘⇧T)" : "Show side panel (⌘⇧T)"}
        className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition flex-shrink-0"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {railOpen ? (
          <PanelRightClose size={14} />
        ) : (
          <PanelRightOpen size={14} />
        )}
      </button>
      <button
        onClick={onRefresh}
        aria-label="Refresh analytics"
        title="Refresh"
        className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <RefreshCw size={14} />
      </button>
    </header>
  );
}
