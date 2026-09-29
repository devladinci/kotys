import { Loader2, Square, Volume2 } from "lucide-react";
import {
  ACTION_BUTTON_CLASS,
  ACTIVE_ACTION_BUTTON_CLASS,
} from "../actionButton";
import { useReadAloud } from "./readAloud/useReadAloud";

interface IProps {
  messageId: number;
  content: string;
}

export function SpeakerButton({ messageId, content }: IProps) {
  const { speech, messageId: readingId, speak } = useReadAloud();
  const [state, api] = speech;
  const phase = readingId === messageId ? state.phase : "idle";
  const isLoading = phase === "loading";
  const isActive = isLoading || phase === "playing" || phase === "paused";

  const handleClick = () => {
    if (isActive) {
      api.stop();
      return;
    }
    speak(messageId, content);
  };

  const Icon = isLoading ? Loader2 : isActive ? Square : Volume2;
  const label = isActive ? "Stop reading" : "Read aloud";

  return (
    <button
      onClick={handleClick}
      className={isActive ? ACTIVE_ACTION_BUTTON_CLASS : ACTION_BUTTON_CLASS}
      title={label}
      aria-label={label}
    >
      <Icon size={13} className={isLoading ? "animate-spin" : undefined} />
    </button>
  );
}
