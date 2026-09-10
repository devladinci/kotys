import { memo, useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, Pencil, RotateCw } from "lucide-react";
import type { Message, ToolActivity } from "@kotys/contracts";
import { SkillMessage, splitContentByWidgets } from "@kotys/core";
import CopyTextButton from "../CopyTextButton";
import {
  MarkdownBody,
  StreamingProvider,
  ToolCallTimeline,
  WidgetFor,
} from "./widgets";

interface IProps {
  message: Message;
  /** True when this message opens a new turn — gets extra top separation. */
  startsTurn?: boolean;
  isStreamingThis: boolean;
  isHighlighted: boolean;
  onImageClick: (src: string) => void;
  onRegenerate?: (assistantId: number) => void;
  onEditAndResend?: (
    userMessageId: number,
    newText: string,
    newImages?: string[],
  ) => void;
  isLoading?: boolean;
}

function MessageBubbleBase({
  message,
  startsTurn = false,
  isStreamingThis,
  isHighlighted,
  onImageClick,
  onRegenerate,
  onEditAndResend,
  isLoading,
}: IProps) {
  const isUser = message.role === "user";
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const isEmptyStreaming =
    isStreamingThis &&
    !message.content &&
    !message.thinking &&
    !message.toolCalls?.length;

  const startEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    if (draft.trim() && draft !== message.content) {
      onEditAndResend?.(message.id, draft, message.images);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(message.content);
  };

  // createdAt is unixepoch seconds; in-flight optimistic messages lack it.
  const time = message.createdAt
    ? new Date(message.createdAt * 1000).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : undefined;
  const fullTime = message.createdAt
    ? new Date(message.createdAt * 1000).toLocaleString()
    : undefined;

  return (
    <div
      data-message-id={message.id}
      className={`group relative ${startsTurn ? "pt-5" : "pt-1.5"} pb-1.5 px-6 ${
        isHighlighted ? "ring-2 ring-inset ring-accent/60" : ""
      }`}
    >
      {/* Mobile-parity layout: only user messages are bubbles (right-aligned,
          inside the content column); assistant replies render unboxed on the
          background. Role is carried by shape + alignment, not by a full-width
          row band. */}
      <div className="max-w-3xl mx-auto relative">
        {!isStreamingThis && message.content && (
          <span className="absolute right-0 top-0 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition flex items-center gap-0.5 rounded bg-surface/90 px-1 py-0.5">
            {time && (
              <span
                className="text-[10px] text-text-muted/80 mr-0.5"
                title={fullTime}
              >
                {time}
              </span>
            )}
            <CopyTextButton text={message.content} />
            {isUser && onEditAndResend && !isLoading && (
              <button
                onClick={startEdit}
                className="p-1 rounded text-text-muted hover:text-text transition"
                title="Edit & resend"
                aria-label="Edit and resend"
              >
                <Pencil size={13} />
              </button>
            )}
            {!isUser && onRegenerate && !isLoading && (
              <button
                onClick={() => onRegenerate(message.id)}
                className="p-1 rounded text-text-muted hover:text-text transition"
                title="Regenerate"
                aria-label="Regenerate response"
              >
                <RotateCw size={13} />
              </button>
            )}
          </span>
        )}
        <div className="max-w-3xl mx-auto">
          {isUser && !editing ? (
            /* Bubble (mobile parity): right-aligned, rounded, tinted, ~85%
               max width. The bubble shape carries the role — no label row. */
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-user px-3 py-2">
                {message.images && message.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {message.images.map((src, i) => {
                      const url = src.startsWith("data:")
                        ? src
                        : `data:image/png;base64,${src}`;
                      return (
                        <button
                          key={i}
                          onClick={() => onImageClick(url)}
                          aria-label="Open image"
                          className="max-h-48 max-w-60 rounded-lg border border-border cursor-zoom-in object-contain p-0 bg-transparent"
                        >
                          <img
                            src={url}
                            alt="Attached"
                            className="max-h-48 max-w-60 rounded-lg object-contain"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
                <UserMessageBody content={message.content} />
              </div>
            </div>
          ) : (
            <>
              {!isUser &&
                !editing &&
                !isStreamingThis &&
                (message.model || message.thinking) && (
                  <div className="mb-1 text-[11px] text-text-muted/80 select-none">
                    {message.model ?? "Assistant"}
                  </div>
                )}
              {message.images && message.images.length > 0 && !editing && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {message.images.map((src, i) => {
                    const url = src.startsWith("data:")
                      ? src
                      : `data:image/png;base64,${src}`;
                    return (
                      <button
                        key={i}
                        onClick={() => onImageClick(url)}
                        aria-label="Open image"
                        className="max-h-48 max-w-60 rounded-lg border border-border cursor-zoom-in object-contain p-0 bg-transparent"
                      >
                        <img
                          src={url}
                          alt="Attached"
                          className="max-h-48 max-w-60 rounded-lg object-contain"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
              {editing && (
                <div className="mb-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        commitEdit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    ref={editRef}
                    rows={3}
                    aria-label="Edit message"
                    className="w-full bg-bg border border-border rounded-lg p-2 text-sm text-text outline-none focus:border-accent resize-y min-h-16"
                  />
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-text-muted">
                    <button
                      onClick={commitEdit}
                      className="px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover transition"
                    >
                      Send
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-2 py-1 rounded hover:bg-surface-2 transition"
                    >
                      Cancel
                    </button>
                    <span className="ml-auto">
                      Enter to send · Esc to cancel
                    </span>
                  </div>
                </div>
              )}
              {!editing && !isUser && message.thinking && (
                <div className="mb-2">
                  <button
                    onClick={() => setThinkingOpen((o) => !o)}
                    aria-expanded={thinkingOpen}
                    className={`flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition ${
                      isStreamingThis && !message.content ? "animate-pulse" : ""
                    }`}
                  >
                    <Brain size={13} />
                    {isStreamingThis && !message.content
                      ? "Thinking\u2026"
                      : "Thinking"}
                    <ChevronDown
                      size={12}
                      className={thinkingOpen ? "" : "-rotate-90"}
                    />
                  </button>
                  {thinkingOpen && (
                    <div className="mt-2 pl-3 border-l-2 border-border text-xs leading-relaxed text-text-muted whitespace-pre-wrap">
                      {message.thinking}
                    </div>
                  )}
                </div>
              )}
              {!editing &&
                !isUser &&
                message.toolCalls &&
                message.toolCalls.length > 0 && (
                  <ToolCallTimeline
                    calls={message.toolCalls.filter(
                      (tc): tc is ToolActivity => !!tc,
                    )}
                    isStreaming={isStreamingThis}
                  />
                )}
              {!editing && isEmptyStreaming ? (
                <div className="flex items-center gap-1 py-1.5">
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              ) : editing ? null : isUser ? (
                <UserMessageBody content={message.content} />
              ) : (
                <StreamingProvider value={isStreamingThis}>
                  {splitContentByWidgets(
                    message.content,
                    message.toolCalls ?? [],
                  ).map((segment, i) =>
                    segment.kind === "text" ? (
                      <MarkdownBody key={i} content={segment.text} />
                    ) : (
                      <WidgetFor key={i} widget={segment.widget} />
                    ),
                  )}
                </StreamingProvider>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const MessageBubble = memo(MessageBubbleBase);
export default MessageBubble;

/** Skill invocations render through the same markdown body, minus the header. */
function UserMessageBody({ content }: { content: string }) {
  return <MarkdownBody content={SkillMessage.fromContent(content)?.displayContent ?? content} />;
}
