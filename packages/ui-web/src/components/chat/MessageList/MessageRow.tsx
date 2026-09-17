import { MessageBubble } from "../MessageBubble";
import { Divider } from "./Divider";
import type { Row } from "./rows";

export interface IRowCallbacks {
  streamingId: number | null;
  highlightId: number | null;
  onImageClick: (src: string) => void;
  onRegenerate?: (assistantId: number) => void;
  onEditAndResend?: (
    userMessageId: number,
    newText: string,
    newImages?: string[],
  ) => void;
  isLoading?: boolean;
}

interface IProps extends IRowCallbacks {
  row: Row;
}

export function MessageRow({ row, streamingId, highlightId, ...rest }: IProps) {
  if (row.kind === "divider") return <Divider data={row.data} />;
  return (
    <MessageBubble
      message={row.message}
      isTurnStart={row.startsTurn}
      isStreamingThis={row.message.id === streamingId}
      isHighlighted={highlightId === row.message.id}
      {...rest}
    />
  );
}
