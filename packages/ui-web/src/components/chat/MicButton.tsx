import { memo, useEffect, useState } from "react";
import { Mic } from "lucide-react";
import type { DictationState } from "@saystack/react";
import { useHoldToTalk } from "@saystack/react-web";

interface IProps {
  status: DictationState;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}

const useElapsedSeconds = (active: boolean): number => {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const t = setInterval(
      () => setSeconds(Math.round((Date.now() - started) / 1000)),
      500,
    );
    return () => clearInterval(t);
  }, [active]);
  return seconds;
};

const titleFor = (
  recording: boolean,
  isCancelling: boolean,
  isTooShort: boolean,
): string => {
  if (isCancelling) return "Release to cancel";
  if (recording) return "Release to transcribe, drag away to cancel";
  if (isTooShort) return "Hold longer to dictate";
  return "Hold to dictate";
};

function MicButtonBase({ status, onStart, onStop, onCancel }: IProps) {
  const recording = status === "recording";
  const seconds = useElapsedSeconds(recording);
  const hold = useHoldToTalk({ onStart, onEnd: onStop, onCancel });

  if (status === "transcribing") {
    return (
      <button
        disabled
        aria-label="Transcribing"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent animate-pulse transition"
      >
        <Mic size={16} />
      </button>
    );
  }

  const showSeconds = recording && seconds > 0;

  return (
    <button
      {...hold.handlers}
      aria-label={
        recording
          ? `Stop recording — ${seconds} seconds`
          : "Hold to record voice"
      }
      title={titleFor(recording, hold.isCancelling, hold.isTooShort)}
      className={
        hold.isCancelling
          ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-text-muted transition"
          : recording
            ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-400 transition"
            : "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition"
      }
    >
      {recording && !hold.isCancelling ? (
        <span className="relative flex items-center justify-center">
          <span className="absolute h-4 w-4 rounded-full bg-red-500/40 animate-ping" />
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
      ) : (
        <Mic size={16} />
      )}
      {showSeconds && (
        <span className="sr-only">{seconds} seconds recorded</span>
      )}
    </button>
  );
}

const MicButton = memo(MicButtonBase);
export default MicButton;
