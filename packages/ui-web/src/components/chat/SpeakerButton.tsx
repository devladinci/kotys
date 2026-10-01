import type { RefObject } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";
import { useReadAloudMessage } from "@saystack/react-web";
import {
  ACTION_BUTTON_CLASS,
  ACTIVE_ACTION_BUTTON_CLASS,
} from "../actionButton";
import { READ_ALONG_LAYER } from "./auraLayer";

interface IProps {
  messageId: number;
  content: string;
  bodyRef: RefObject<HTMLElement | null>;
}

export function SpeakerButton({ messageId, content, bodyRef }: IProps) {
  const readAloud = useReadAloudMessage(messageId, bodyRef, {
    zIndex: READ_ALONG_LAYER,
  });

  const handleClick = () => {
    if (readAloud.isActive) {
      readAloud.stop();
      return;
    }
    readAloud.speak(content);
  };

  const Icon = readAloud.isLoading
    ? Loader2
    : readAloud.isActive
      ? Square
      : Volume2;
  const label = readAloud.isActive ? "Stop reading" : "Read aloud";

  return (
    <button
      onClick={handleClick}
      className={
        readAloud.isActive ? ACTIVE_ACTION_BUTTON_CLASS : ACTION_BUTTON_CLASS
      }
      title={label}
      aria-label={label}
    >
      <Icon
        size={13}
        className={readAloud.isLoading ? "animate-spin" : undefined}
      />
    </button>
  );
}
