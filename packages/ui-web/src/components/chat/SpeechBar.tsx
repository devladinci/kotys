import { Loader2, Square, X } from "lucide-react";
import { useSpeech } from "@kotys/core";

interface IProps {
  onSpeak: () => void;
}

export default function SpeechBar({ onSpeak }: IProps) {
  const { status, text, stop } = useSpeech();
  const isBusy = status === "loading" || status === "playing";

  if (!isBusy) return null;

  return (
    <div className="mx-auto max-w-3xl mb-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface text-[12px] text-text-muted">
      {status === "loading" ? (
        <>
          <Loader2 size={14} className="animate-spin text-accent" />
          <span className="flex-1 truncate">Synthesizing speech…</span>
        </>
      ) : (
        <>
          <Square size={14} className="text-accent" />
          <span className="flex-1 truncate">{text}</span>
        </>
      )}
      <button
        onClick={stop}
        className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text transition"
        title="Stop"
        aria-label="Stop playback"
      >
        <X size={14} />
      </button>
      <button
        onClick={onSpeak}
        className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text transition"
        title="Replay"
        aria-label="Replay"
      >
        Replay
      </button>
    </div>
  );
}
