import { useCallback, useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { usePomodoroStore } from "@kotys/core";
import {
  BREAK_BOUNDS,
  BREAK_PRESETS,
  FOCUS_BOUNDS,
  FOCUS_PRESETS,
} from "@kotys/core";
import DurationField from "../pomodoro/DurationField";

const formatDate = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

const formatLength = (seconds: number): string =>
  `${Math.round(seconds / 60)}m`;

export default function PomodoroSettings() {
  const defaultDuration = usePomodoroStore((s) => s.defaultDuration);
  const defaultBreak = usePomodoroStore((s) => s.defaultBreak);
  const setDefaults = usePomodoroStore((s) => s.setDefaults);
  const history = usePomodoroStore((s) => s.history);
  const loadHistory = usePomodoroStore((s) => s.loadHistory);
  const [duration, setDuration] = useState(defaultDuration);
  const [breakDuration, setBreakDuration] = useState(defaultBreak);
  const [saved, setSaved] = useState(false);
  const prevDefaultsRef = useRef({ defaultDuration, defaultBreak });

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const prev = prevDefaultsRef.current;
    if (
      prev.defaultDuration !== defaultDuration ||
      prev.defaultBreak !== defaultBreak
    ) {
      setDuration(defaultDuration);
      setBreakDuration(defaultBreak);
      prevDefaultsRef.current = { defaultDuration, defaultBreak };
    }
  }, [defaultDuration, defaultBreak]);

  const save = useCallback(() => {
    void setDefaults(duration, breakDuration).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }, [setDefaults, duration, breakDuration]);

  const finished = history.filter(
    (s) => s.status === "completed" || s.status === "cancelled",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-text">
        <Timer size={18} className="text-accent" />
        <h2 className="text-base font-semibold">Pomodoro defaults</h2>
      </div>

      <p className="text-sm text-text-muted">
        These values are used when you (or the model) start a Pomodoro without
        specifying a duration.
      </p>

      <div className="max-w-[15rem] grid grid-cols-[2.75rem_1fr_2.5rem_1.25rem] items-center gap-x-1.5 gap-y-2">
        <DurationField
          label="Focus"
          unit="min"
          value={duration}
          presets={FOCUS_PRESETS}
          onChange={setDuration}
          {...FOCUS_BOUNDS}
        />
        <DurationField
          label="Break"
          unit="min"
          value={breakDuration}
          presets={BREAK_PRESETS}
          onChange={setBreakDuration}
          {...BREAK_BOUNDS}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition"
        >
          Save defaults
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved</span>}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-text">Recent sessions</h3>
        {finished.length === 0 ? (
          <p className="text-sm text-text-muted">No finished sessions yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {finished.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-3 py-1.5 text-[13px]"
              >
                <span className="flex-1 min-w-0 truncate text-text">
                  {s.task ?? "Focus"}
                </span>
                <span className="flex-shrink-0 tabular-nums text-text-muted">
                  {formatLength(s.duration_seconds)}
                </span>
                <span className="flex-shrink-0 w-16 text-right text-text-muted">
                  {s.status === "completed" ? "Completed" : "Stopped"}
                </span>
                <span className="flex-shrink-0 w-12 text-right tabular-nums text-text-muted">
                  {formatDate(s.started_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
