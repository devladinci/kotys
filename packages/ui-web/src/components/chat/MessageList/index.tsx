import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
  type Ref,
  type UIEvent,
  type WheelEvent,
} from "react";
import type { ListImperativeAPI } from "react-window";
import type { Message } from "@kotys/contracts";
import { EmptyState } from "./EmptyState";
import { MessageRow, type IRowCallbacks } from "./MessageRow";
import { VirtualMessages } from "./VirtualMessages";
import { buildRows } from "./rows";

export interface IMessageListHandle {
  scrollToBottom: (smooth?: boolean) => void;
}

interface IProps extends IRowCallbacks {
  messages: Message[];
  compactUpto: number;
  summary?: string | null;
  onPickExample?: (text: string) => void;
  /** Reports whether the newest message is in view. */
  onAtBottomChange: (atBottom: boolean) => void;
  /** Rendered under the messages, inside the scrolling area. */
  footer?: ReactNode;
  ref?: Ref<IMessageListHandle>;
}

// Above this, rows are virtualized and the list keeps its own scroller.
const VIRTUAL_THRESHOLD = 200;
const BOTTOM_SLACK_PX = 80;

const SCROLLER_CLASS = "h-full overflow-y-auto scrollbar-thin";

export default function MessageList({
  messages,
  compactUpto,
  summary,
  onPickExample,
  onAtBottomChange,
  footer,
  ref,
  ...callbacks
}: IProps) {
  const rows = useMemo(
    () => buildRows(messages, compactUpto, summary ?? null),
    [messages, compactUpto, summary],
  );
  const isVirtual = messages.length > VIRTUAL_THRESHOLD;
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<ListImperativeAPI>(null);
  // Virtual rows start at an estimate and shrink as they are measured, so a
  // single scroll lands short; stay pinned until the heights settle.
  const stickToBottom = useRef(true);

  const scrollToBottom = useCallback(
    (smooth = false) => {
      stickToBottom.current = true;
      const el = isVirtual ? listRef.current?.element : scrollRef.current;
      el?.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
    },
    [isVirtual],
  );

  useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom]);

  const handleRowsRendered = useCallback(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [scrollToBottom]);

  const handleScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;
      stickToBottom.current = atBottom;
      onAtBottomChange(atBottom);
    },
    [onAtBottomChange],
  );

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLElement>) => {
      const el = e.currentTarget;
      if (e.deltaY < 0 && el.scrollHeight > el.clientHeight + 4) {
        stickToBottom.current = false;
        onAtBottomChange(false);
      }
    },
    [onAtBottomChange],
  );

  if (messages.length === 0) {
    return (
      <div className={SCROLLER_CLASS}>
        <EmptyState onPickExample={onPickExample} />
      </div>
    );
  }

  if (isVirtual) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0">
          <VirtualMessages
            rows={rows}
            listRef={listRef}
            onScroll={handleScroll}
            onWheel={handleWheel}
            onRowsRendered={handleRowsRendered}
            {...callbacks}
          />
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={SCROLLER_CLASS}
      onScroll={handleScroll}
      onWheel={handleWheel}
    >
      {rows.map((row) => (
        <MessageRow
          key={row.kind === "divider" ? "compaction-divider" : row.message.id}
          row={row}
          {...callbacks}
        />
      ))}
      {footer}
    </div>
  );
}
