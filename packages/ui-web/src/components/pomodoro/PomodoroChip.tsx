import { memo } from "react";
import { usePomodoroStore } from "@kotys/core";
import { useTodoStore } from "@kotys/core";

const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The panel lives in the Tasks rail, so a closed rail would otherwise leave a
 * running session with nothing on screen. This is the one place the timer
 * follows you out: header-only, click to bring the panel back.
 */
function PomodoroChipBase() {
  const session = usePomodoroStore((s) => s.session);
  const phase = usePomodoroStore((s) => s.phase);
  const remaining = usePomodoroStore((s) => s.remaining);
  const reveal = usePomodoroStore((s) => s.reveal);
  const sidebarOpen = useTodoStore((s) => s.sidebarOpen);

  const active =
    session !== null &&
    (session.status === "running" || session.status === "paused");
  if (sidebarOpen || !active || session === null) return null;

  const paused = session.status === "paused";
  const label = phase === "focus" ? "Focus" : "Break";

  return (
    <button
      type="button"
      onClick={reveal}
      title={`${label}${session.task ? ` · ${session.task}` : ""} — show timer`}
      aria-label={`${label}, ${formatTime(remaining)} remaining. Show timer.`}
      className={`flex-shrink-0 flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-lg border text-xs transition-colors ${
        phase === "focus" && !paused
          ? "border-accent/60 bg-accent/10"
          : "border-border hover:bg-surface-2"
      }`}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          paused
            ? "bg-text-muted"
            : phase === "focus"
              ? "bg-accent"
              : "bg-text-muted"
        }`}
        aria-hidden="true"
      />
      <span className="font-semibold tabular-nums text-text">
        {formatTime(remaining)}
      </span>
      {session.cycles > 1 && (
        <span className="text-text-muted tabular-nums">
          {phase === "focus"
            ? Math.min(session.cycles, session.cycles_completed + 1)
            : session.cycles_completed}
          /{session.cycles}
        </span>
      )}
    </button>
  );
}

const PomodoroChip = memo(PomodoroChipBase);
export default PomodoroChip;
