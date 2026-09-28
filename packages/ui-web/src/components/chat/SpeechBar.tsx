import { useEffect, useState } from "react";
import { Loader2, PauseCircle, RotateCcw, X } from "lucide-react";
import { useLingering, useSpeech } from "@kotys/core";

interface IProps {
  onSpeak?: () => void;
}

export default function SpeechBar({ onSpeak }: IProps) {
  const { status, text, stop } = useSpeech();
  const isBusy = status === "loading" || status === "playing";
  const visible = useLingering(isBusy);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (isBusy) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors external speech store into local fade state */
      setFading(false);

      return;
    }
    if (!visible) return;
    const timer = setTimeout(() => setFading(true), 27_000);

    return () => clearTimeout(timer);
  }, [isBusy, visible]);

  if (!visible) return null;

  return (
    <div
      className={`mx-auto max-w-3xl mb-3 flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-accent/30 bg-accent/10 shadow-sm transition-opacity duration-1000 ${fading ? "opacity-0" : "opacity-100"}`}
    >
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
          <span className="flex-1 truncate text-[13px] text-text">
            {status === "error" ? "Speech failed" : text}
          </span>
          {onSpeak && (
            <button
              onClick={onSpeak}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-surface text-[12px] text-text-muted hover:text-text hover:bg-surface-2 transition"
              title="Replay"
              aria-label="Replay"
            >
              <RotateCcw size={12} />
              Replay
            </button>
          )}
        </>
      )}
      <X
        size={16}
        className="text-text-muted hover:text-text cursor-pointer shrink-0"
        onClick={stop}
        role="button"
        aria-label="Close"
      />
    </div>
  );
}
