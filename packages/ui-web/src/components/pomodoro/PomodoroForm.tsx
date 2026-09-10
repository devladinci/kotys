import { memo, useCallback, useState } from "react";
import { Timer } from "lucide-react";
import DurationField from "./DurationField";
import {
  BREAK_BOUNDS,
  BREAK_PRESETS,
  CYCLE_BOUNDS,
  CYCLE_PRESETS,
  FOCUS_BOUNDS,
  FOCUS_PRESETS,
} from "@kotys/core";

interface IProps {
  defaultDuration: number;
  defaultBreak: number;
  onStart: (opts: {
    task?: string;
    duration_minutes?: number;
    break_minutes?: number;
    cycles?: number;
  }) => void;
}

function PomodoroFormBase({ defaultDuration, defaultBreak, onStart }: IProps) {
  const [task, setTask] = useState("");
  const [duration, setDuration] = useState(defaultDuration);
  const [breakDuration, setBreakDuration] = useState(defaultBreak);
  const [cycles, setCycles] = useState(1);

  const submit = useCallback(() => {
    onStart({
      task: task.trim() || undefined,
      duration_minutes: duration,
      break_minutes: breakDuration,
      cycles,
    });
  }, [task, duration, breakDuration, cycles, onStart]);

  return (
    <div className="p-2.5 space-y-2.5">
      <input
        type="text"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="What are you focusing on?"
        aria-label="Task (optional)"
        className="w-full px-2 py-1 text-[13px] rounded-md bg-bg border border-border text-text placeholder-text-muted outline-none focus:border-accent"
      />

      <div className="grid grid-cols-[2.75rem_1fr_2.5rem_1.25rem] items-center gap-x-1.5 gap-y-2">
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
        <DurationField
          label="Cycles"
          value={cycles}
          presets={CYCLE_PRESETS}
          onChange={setCycles}
          {...CYCLE_BOUNDS}
        />
      </div>

      <button
        onClick={submit}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-[13px] font-medium transition"
      >
        <Timer size={14} />
        Start {duration}m focus
      </button>
    </div>
  );
}

const PomodoroForm = memo(PomodoroFormBase);
export default PomodoroForm;
