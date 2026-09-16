import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { List, useDynamicRowHeight } from "react-window";
import type { Message } from "@kotys/contracts";
import { MessageBubble } from "./MessageBubble";

interface IProps {
  messages: Message[];
  streamingId: number | null;
  highlightId: number | null;
  compactUpto: number;
  summary?: string | null;
  onImageClick: (src: string) => void;
  onRegenerate?: (assistantId: number) => void;
  onEditAndResend?: (
    userMessageId: number,
    newText: string,
    newImages?: string[],
  ) => void;
  isLoading?: boolean;
  onPickExample?: (text: string) => void;
}

type DividerData = { summarizedCount: number; summaryText: string | null };
type Row =
  | { kind: "divider"; data: DividerData }
  | { kind: "message"; message: Message; startsTurn: boolean };
type RowData = {
  rows: Row[];
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
};

const DIVIDER_HEIGHT = 40;
const MESSAGE_ESTIMATE = 200;

function buildRows(
  messages: Message[],
  compactUpto: number,
  summary: string | null,
): Row[] {
  const rows: Row[] = [];
  let dividerPlaced = false;
  messages.forEach((message, index) => {
    const crossesCompaction =
      compactUpto > 0 &&
      message.id > compactUpto &&
      index > 0 &&
      messages[index - 1].id <= compactUpto;
    if (crossesCompaction && !dividerPlaced) {
      rows.push({
        kind: "divider",
        data: dividerData(messages, compactUpto, summary),
      });
      dividerPlaced = true;
    }
    // Turn rhythm: a user message always opens a new turn (ChatGPT/Claude
    // pattern) and gets extra separation from whatever is above it.
    const startsTurn = message.role === "user";
    rows.push({ kind: "message", message, startsTurn });
  });
  // A forced compact can anchor on the very last message, leaving nothing
  // after the boundary — the marker then belongs at the end of the list.
  if (compactUpto > 0 && !dividerPlaced) {
    rows.push({
      kind: "divider",
      data: dividerData(messages, compactUpto, summary),
    });
  }
  return rows;
}

function dividerData(
  messages: Message[],
  compactUpto: number,
  summary: string | null,
): DividerData {
  const summarizedCount = messages.filter(
    (m) => m.id <= compactUpto && m.role !== "system",
  ).length;
  return { summarizedCount, summaryText: summary };
}

function Divider({ data }: { data: DividerData }) {
  const [open, setOpen] = useState(false);
  const count = data.summarizedCount > 0 ? ` (${data.summarizedCount})` : "";
  return (
    <div className="py-2 px-6 flex flex-col items-center gap-1">
      <div className="w-full flex items-center gap-3 text-xs text-text-muted">
        <div className="flex-1 border-t border-border" />
        {data.summaryText ? (
          <button
            onClick={() => setOpen((open) => !open)}
            className="flex items-center gap-1 hover:text-text transition"
            aria-expanded={open}
            title="Show the conversation summary"
          >
            <ChevronDown
              size={12}
              className={`transition ${open ? "rotate-180" : ""}`}
            />
            {data.summarizedCount} earlier message{count === "" ? "" : "s"}{" "}
            summarized
          </button>
        ) : (
          "earlier messages summarized"
        )}
        <div className="flex-1 border-t border-border" />
      </div>
      {open && data.summaryText && (
        <div className="w-full max-w-2xl max-h-56 overflow-y-auto scrollbar-thin rounded-lg bg-surface-2 border border-border p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap text-text-muted text-left">
          {data.summaryText}
        </div>
      )}
    </div>
  );
}

function RowComponent({
  index,
  style,
  rows,
  streamingId,
  highlightId,
  onImageClick,
  onRegenerate,
  onEditAndResend,
  isLoading,
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: {
    "aria-posinset": number;
    "aria-setsize": number;
    role: "listitem";
  };
} & RowData) {
  const row = rows[index];
  if (!row) return null;
  if (row.kind === "divider") {
    return (
      <div style={style}>
        <Divider data={row.data} />
      </div>
    );
  }
  const message = row.message;
  return (
    <div style={style}>
      <MessageBubble
        message={message}
        isTurnStart={row.startsTurn}
        isStreamingThis={message.id === streamingId}
        isHighlighted={highlightId === message.id}
        onImageClick={onImageClick}
        onRegenerate={onRegenerate}
        onEditAndResend={onEditAndResend}
        isLoading={isLoading}
      />
    </div>
  );
}

const VIRTUAL_THRESHOLD = 200;

export default function MessageList({
  messages,
  streamingId,
  highlightId,
  compactUpto,
  summary,
  onImageClick,
  onRegenerate,
  onEditAndResend,
  isLoading,
  onPickExample,
}: IProps) {
  const rows = useMemo(
    () => buildRows(messages, compactUpto, summary ?? null),
    [messages, compactUpto, summary],
  );

  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted px-6 py-10">
        <p className="text-sm mb-4">Start the conversation, or try:</p>
        {onPickExample ? (
          <div className="grid gap-2 max-w-md w-full">
            {STATIC_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => onPickExample(ex)}
                className="text-left text-sm px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-2 hover:border-accent transition"
              >
                {ex}
              </button>
            ))}
          </div>
        ) : (
          <ul className="text-sm text-text-muted/80 list-disc pl-5">
            {STATIC_EXAMPLES.map((text, i) => (
              <li key={`${text}-${i}`}>{text}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (messages.length > VIRTUAL_THRESHOLD) {
    return (
      <DynamicVirtualList
        rows={rows}
        streamingId={streamingId}
        highlightId={highlightId}
        onImageClick={onImageClick}
        onRegenerate={onRegenerate}
        onEditAndResend={onEditAndResend}
        isLoading={isLoading}
      />
    );
  }

  return (
    <>
      {rows.map((row, i) =>
        row.kind === "divider" ? (
          <Fragment key={`d-${i}`}>
            <Divider data={row.data} />
          </Fragment>
        ) : (
          <MessageBubble
            key={row.message.id}
            message={row.message}
            isTurnStart={row.startsTurn}
            isStreamingThis={row.message.id === streamingId}
            isHighlighted={highlightId === row.message.id}
            onImageClick={onImageClick}
            onRegenerate={onRegenerate}
            onEditAndResend={onEditAndResend}
            isLoading={isLoading}
          />
        ),
      )}
    </>
  );
}

const STATIC_EXAMPLES = [
  "Summarize my last conversation about the API migration.",
  "Create a todo: review the PR by Friday.",
  "Remember that I prefer TypeScript over JavaScript.",
  "What's the weather like in Lisbon right now?",
];

function DynamicVirtualList({
  rows,
  streamingId,
  highlightId,
  onImageClick,
  onRegenerate,
  onEditAndResend,
  isLoading,
}: {
  rows: Row[];
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
}) {
  const dynamic = useDynamicRowHeight({
    defaultRowHeight: MESSAGE_ESTIMATE,
  });
  const rowHeight = (index: number) => {
    const row = rows[index];
    if (!row || row.kind === "divider") return DIVIDER_HEIGHT;
    return dynamic.getRowHeight(index) ?? MESSAGE_ESTIMATE;
  };
  return (
    <List
      rowCount={rows.length}
      rowHeight={rowHeight}
      rowComponent={RowComponent}
      rowProps={{
        rows,
        streamingId,
        highlightId,
        onImageClick,
        onRegenerate,
        onEditAndResend,
        isLoading,
      }}
      style={{ height: "100%" }}
      className="h-full"
    />
  );
}
