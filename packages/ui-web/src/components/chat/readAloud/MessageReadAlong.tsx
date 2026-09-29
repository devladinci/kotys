import { useEffect, type RefObject } from "react";
import { useReadAlong } from "@saystack/react-web";
import { useReadAloud } from "./useReadAloud";

interface IProps {
  messageId: number;
  rootRef: RefObject<HTMLElement | null>;
}

export function MessageReadAlong({ messageId, rootRef }: IProps) {
  const {
    speech,
    messageId: readingId,
    isSummary,
    anchorMessage,
  } = useReadAloud();
  const [state] = speech;
  const isReadingThis = readingId === messageId;

  // A summary uses other words than the reply, so only the aura follows it.
  useReadAlong(rootRef, speech, {
    isActive: isReadingThis && !isSummary && state.phase !== "idle",
  });

  useEffect(() => {
    const element = rootRef.current;
    if (!isReadingThis || !element) return;

    return anchorMessage(element);
  }, [isReadingThis, rootRef, anchorMessage]);

  return null;
}
