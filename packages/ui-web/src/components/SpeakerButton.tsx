import { Loader2, Square, Volume2 } from "lucide-react";
import { useSpeech, useAppStore } from "@kotys/core";
import type { SpeechStatus } from "@kotys/core";

interface IProps {
  text: string;
}

const ICONS: Record<SpeechStatus, typeof Volume2> = {
  idle: Volume2,
  loading: Loader2,
  playing: Square,
  error: Volume2,
};

function ActiveSpeakerButton({ text }: IProps) {
  const { status, speak, stop } = useSpeech();

  const Icon = ICONS[status];
  const isBusy = status === "loading" || status === "playing";
  const isPlaying = status === "playing";

  const handleClick = () => {
    if (isPlaying) {
      stop();
      return;
    }
    void speak(text);
  };

  return (
    <button
      onClick={handleClick}
      disabled={status === "loading"}
      className={`p-1 rounded text-text-muted hover:text-text transition ${
        isBusy ? "text-accent" : ""
      }`}
      title={isPlaying ? "Stop" : "Play aloud"}
      aria-label={isPlaying ? "Stop playback" : "Play aloud"}
    >
      <Icon size={13} className={status === "loading" ? "animate-spin" : ""} />
    </button>
  );
}

export default function SpeakerButton({ text }: IProps) {
  const ttsModel = useAppStore((s) => s.ttsModel);

  if (!ttsModel) return null;

  return <ActiveSpeakerButton text={text} />;
}
