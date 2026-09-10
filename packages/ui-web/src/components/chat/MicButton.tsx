import { memo, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import type { VoiceStatus } from "@kotys/core";

interface IProps {
  status: VoiceStatus;
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

function MicButtonBase({ status, onStart, onStop, onCancel }: IProps) {
  const recording = status === "recording";
  const seconds = useElapsedSeconds(recording);
  const pressed = useRef(false);

  const endPress = (transcribe: boolean) => {
    if (!pressed.current) return;
    pressed.current = false;
    if (transcribe) onStop();
    else onCancel();
  };

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
      onPointerDown={(e) => {
        // Capture so a press that drifts off the button still releases here
        // (onPointerUp/Leave stay ours) instead of being lost mid-press.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pressed.current = true;
        onStart();
      }}
      onPointerUp={() => endPress(true)}
      onPointerCancel={() => endPress(false)}
      onPointerLeave={() => endPress(false)}
      aria-label={
        recording
          ? `Stop recording — ${seconds} seconds`
          : "Hold to record voice"
      }
      title={recording ? "Release to transcribe" : "Hold to dictate"}
      className={
        recording
          ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-400 transition"
          : "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition"
      }
    >
      {recording ? (
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
