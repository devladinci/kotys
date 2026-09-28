import { Loader2, PauseCircle, RotateCcw } from "lucide-react";
import { useSpeech } from "@kotys/core";

interface IProps {
  onSpeak: () => void;
}

export default function SpeechBar({ onSpeak }: IProps) {
  const { status, text, stop } = useSpeech();
  const isBusy = status === "loading" || status === "playing";

  if (!isBusy) return null;

  return (
    <div className="mx-auto max-w-3xl mb-3 flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-accent/30 bg-accent/10 shadow-sm">
      {status === "loading" ? (
        <>
          <Loader2 size={16} className="animate-spin text-accent shrink-0" />
          <span className="flex-1 truncate text-[13px] text-text">
            Synthesizing speech…
          </span>
        </>
      ) : (
        <>
          <PauseCircle
            size={18}
            className="text-accent shrink-0 cursor-pointer"
            onClick={stop}
            role="button"
            aria-label="Stop playback"
          />
          <span className="flex-1 truncate text-[13px] text-text">{text}</span>
          <button
            onClick={onSpeak}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-surface text-[12px] text-text-muted hover:text-text hover:bg-surface-2 transition"
            title="Replay"
            aria-label="Replay"
          >
            <RotateCcw size={12} />
            Replay
          </button>
        </>
      )}
    </div>
  );
}
