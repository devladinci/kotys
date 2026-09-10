import {
  memo,
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  SkipForward,
  Square,
  Timer,
  X,
} from "lucide-react";
import { usePomodoroStore, type PomodoroPhase } from "@kotys/core";
import type { PomodoroSessionRecord } from "@kotys/contracts";
import PomodoroForm from "./PomodoroForm";

const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
};

// Accent means focus is live. A break is the same chrome gone quiet rather
// than a second colour, which keeps the rail to one accent overall.
const phaseClass = (phase: PomodoroPhase) =>
  phase === "focus" ? "text-accent" : "text-text-muted";

/**
 * Cycles counted the way the session reads them: during focus the current
 * cycle is in progress and counts, during a break it has just been banked.
 */
const cycleProgress = (session: PomodoroSessionRecord, phase: PomodoroPhase) =>
  phase === "focus"
    ? Math.min(session.cycles, session.cycles_completed + 1)
    : session.cycles_completed;

// Past a handful, dots stop being countable and the label carries it alone.
const MAX_PIPS = 8;

const DRAG = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

const ICON_BUTTON =
  "p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors";

function CyclePips({ done, total }: { done: number; total: number }) {
  if (total <= 1 || total > MAX_PIPS) return null;
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i < done ? "bg-accent" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

function PomodoroPanelBase() {
  const session = usePomodoroStore((s) => s.session);
  const phase = usePomodoroStore((s) => s.phase);
  const remaining = usePomodoroStore((s) => s.remaining);
  const collapsed = usePomodoroStore((s) => s.collapsed);
  const setCollapsed = usePomodoroStore((s) => s.setCollapsed);
  const start = usePomodoroStore((s) => s.start);
  const pause = usePomodoroStore((s) => s.pause);
  const resume = usePomodoroStore((s) => s.resume);
  const stop = usePomodoroStore((s) => s.stop);
  const skipBreak = usePomodoroStore((s) => s.skipBreak);
  const defaultDuration = usePomodoroStore((s) => s.defaultDuration);
  const defaultBreak = usePomodoroStore((s) => s.defaultBreak);
  const error = usePomodoroStore((s) => s.error);
  const setError = usePomodoroStore((s) => s.setError);

  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error, setError]);

  const handleStart = useCallback(
    (opts: {
      task?: string;
      duration_minutes?: number;
      break_minutes?: number;
      cycles?: number;
    }) => {
      void start(opts);
      setShowForm(false);
    },
    [start],
  );

  const isActive =
    session !== null &&
    (session.status === "running" || session.status === "paused");
  const running = session?.status === "running";
  // The card already breaks the two sections apart; without one, a hairline
  // does the job that a whole divider row used to.
  const hasCard = showForm || (isActive && !collapsed);

  /**
   * The rail's first row lines up with the chat header and stays draggable,
   * the way the Tasks row did before Focus moved above it. The row itself is
   * the disclosure control — the chevron repeats it for the pointer, marked
   * aria-hidden so assistive tech is offered one control, not two.
   */
  const header = (opts: {
    lead: ReactNode;
    onToggle: () => void;
    expanded: boolean;
    label: string;
    controls?: ReactNode;
  }) => (
    <div className="pt-10 px-2.5 pb-1.5 flex items-center gap-1" style={DRAG}>
      <button
        type="button"
        onClick={opts.onToggle}
        aria-expanded={opts.expanded}
        aria-label={opts.label}
        className="flex-1 min-w-0 flex items-center gap-2 -mx-1 px-1 py-0.5 rounded-md text-left hover:bg-surface-2 transition-colors"
        style={NO_DRAG}
      >
        {opts.lead}
      </button>
      {opts.controls}
      <button
        type="button"
        onClick={opts.onToggle}
        tabIndex={-1}
        aria-hidden="true"
        className={ICON_BUTTON}
        style={NO_DRAG}
      >
        {opts.expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
    </div>
  );

  const errorBanner = error ? (
    <div
      role="alert"
      className="mx-2.5 mb-2 flex items-start gap-2 rounded-md border border-red-400/40 bg-red-400/10 px-2.5 py-1.5 text-[11px] text-red-300"
    >
      <span className="flex-1 break-words">{error}</span>
      <button
        type="button"
        onClick={() => setError(null)}
        aria-label="Dismiss error"
        className="text-red-300/70 hover:text-red-200"
      >
        <X size={12} />
      </button>
    </div>
  ) : null;

  const wrapper = (children: ReactNode) => (
    <section
      aria-label="Focus timer"
      className={`flex-shrink-0 ${hasCard ? "" : "border-b border-border"}`}
    >
      {children}
    </section>
  );

  if (showForm) {
    return wrapper(
      <>
        {header({
          expanded: true,
          label: "Cancel new session",
          onToggle: () => setShowForm(false),
          lead: (
            <>
              <Timer size={14} className="text-text-muted flex-shrink-0" />
              <span className="text-[13px] font-medium">New session</span>
            </>
          ),
        })}
        {errorBanner}
        <div className="mx-2.5 mb-2.5 rounded-lg border border-border bg-surface">
          <PomodoroForm
            defaultDuration={defaultDuration}
            defaultBreak={defaultBreak}
            onStart={handleStart}
          />
        </div>
      </>,
    );
  }

  // Idle: the section header is the affordance. No panel, no second row — an
  // unused timer should cost the rail nothing beyond the row it already needs.
  if (!isActive || session === null) {
    return wrapper(
      <>
        {header({
          expanded: false,
          label: "Start focus",
          onToggle: () => setShowForm(true),
          lead: (
            <>
              <Timer size={14} className="text-text-muted flex-shrink-0" />
              <span className="text-[13px] font-medium">Start focus</span>
              <span className="text-[11px] text-text-muted/70 tabular-nums">
                {defaultDuration}m
              </span>
            </>
          ),
        })}
        {errorBanner}
      </>,
    );
  }

  const done = cycleProgress(session, phase);
  const phaseLabel = phase === "focus" ? "Focus" : "Break";

  // Collapsed: still a live strip. Phase, time, cycle and the one control that
  // matters stay on screen — collapsing frees space, it does not hide a timer.
  if (collapsed) {
    return wrapper(
      <>
        {header({
          expanded: false,
          label: "Expand focus timer",
          onToggle: () => setCollapsed(false),
          lead: (
            <>
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  phase === "focus" && running ? "bg-accent" : "bg-text-muted"
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-[11px] font-medium uppercase tracking-[0.08em] ${phaseClass(phase)}`}
              >
                {phaseLabel}
              </span>
              <span className="text-[13px] font-semibold tabular-nums">
                {formatTime(remaining)}
              </span>
              {session.cycles > 1 && (
                <span className="text-[11px] text-text-muted tabular-nums">
                  {done}/{session.cycles}
                </span>
              )}
            </>
          ),
          controls: (
            <button
              type="button"
              onClick={() => void (running ? pause() : resume())}
              aria-label={running ? "Pause" : "Resume"}
              title={running ? "Pause" : "Resume"}
              className={ICON_BUTTON}
              style={NO_DRAG}
            >
              {running ? <Pause size={14} /> : <Play size={14} />}
            </button>
          ),
        })}
        {errorBanner}
      </>,
    );
  }

  return wrapper(
    <>
      {header({
        expanded: true,
        label: "Collapse focus timer",
        onToggle: () => setCollapsed(true),
        lead: (
          <>
            <Timer size={14} className={`${phaseClass(phase)} flex-shrink-0`} />
            <span className="text-[13px] font-medium">{phaseLabel}</span>
            {session.cycles > 1 && (
              <span className="text-[11px] text-text-muted tabular-nums">
                {done} of {session.cycles}
              </span>
            )}
          </>
        ),
      })}

      {errorBanner}

      <div className="mx-2.5 mb-2.5 px-3 pt-2.5 pb-2 rounded-lg border border-border bg-surface flex flex-col items-center gap-1.5">
        <div
          className={`text-[28px] font-semibold tabular-nums leading-none ${
            phase === "focus" ? "text-text" : "text-text-muted"
          }`}
        >
          {formatTime(remaining)}
        </div>

        <CyclePips done={done} total={session.cycles} />

        {session.task && (
          <div className="max-w-full truncate text-[11px] text-text-muted">
            {session.task}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-0.5">
          <button
            type="button"
            onClick={() => void (running ? pause() : resume())}
            aria-label={running ? "Pause" : "Resume"}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border bg-surface text-text hover:bg-surface-2 transition-colors"
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
          </button>
          {phase === "break" && (
            <button
              type="button"
              onClick={() => void skipBreak()}
              aria-label="Skip break"
              className="h-7 px-2 flex items-center gap-1 rounded-md border border-border bg-surface text-text text-[11px] hover:bg-surface-2 transition-colors"
            >
              <SkipForward size={13} />
              Skip break
            </button>
          )}
          <button
            type="button"
            onClick={() => void stop()}
            aria-label="Stop"
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <Square size={14} />
          </button>
        </div>
      </div>
    </>,
  );
}

const PomodoroPanel = memo(PomodoroPanelBase);
export default PomodoroPanel;
