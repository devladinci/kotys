import { memo } from "react";
import {
  AlertCircle,
  Loader2,
  RotateCcw,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useSpeechActions, useSpeechBar } from "@kotys/core";
import type { SpeechPhase } from "@kotys/core";

const BAR_BUTTON_CLASS =
  "shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-text-muted hover:text-text hover:bg-border transition";

const CLOSE_BUTTON_CLASS =
  "shrink-0 p-0.5 rounded text-text-muted hover:text-text transition";

const ICON_CLASS: Record<SpeechPhase, string> = {
  idle: "text-text-muted",
  loading: "animate-spin text-accent",
  playing: "text-accent",
  done: "text-text-muted",
  error: "text-red-400",
};

function SpeechBarBase() {
  const { phase, text, error } = useSpeechBar();
  const { replay, stop } = useSpeechActions();

  if (phase === "idle") return null;

  const isActive = phase === "loading" || phase === "playing";
  const isError = phase === "error";
  const Icon = phase === "loading" ? Loader2 : isError ? AlertCircle : Volume2;
  const label =
    phase === "loading"
      ? "Preparing audio…"
      : isError
        ? (error ?? "Speech failed")
        : text;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs"
    >
      <Icon
        size={13}
        className={`shrink-0 ${ICON_CLASS[phase]}`}
        aria-hidden="true"
      />
      <span
        className={`flex-1 min-w-0 truncate ${isError ? "text-red-400" : "text-text-muted"}`}
      >
        {label}
      </span>
      {isActive ? (
        <button onClick={stop} className={BAR_BUTTON_CLASS}>
          <Square size={11} aria-hidden="true" />
          Stop
        </button>
      ) : (
        <>
          <button onClick={replay} className={BAR_BUTTON_CLASS}>
            <RotateCcw size={11} aria-hidden="true" />
            {isError ? "Retry" : "Replay"}
          </button>
          <button
            onClick={stop}
            className={CLOSE_BUTTON_CLASS}
            title="Close"
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </>
      )}
    </div>
  );
}

export const SpeechBar = memo(SpeechBarBase);
