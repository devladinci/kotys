import { memo, useState } from "react";
import { Brain, ChevronDown, Pencil, RotateCw } from "lucide-react";
import type { Message, ToolActivity } from "@kotys/contracts";
import { isErrorTurn, isSteerActivity } from "@kotys/contracts";
import { splitContentByWidgets } from "@kotys/core";
import CopyTextButton from "../CopyTextButton";
import { MessageImages } from "./MessageImages";
import {
  MarkdownBody,
  StreamingProvider,
  ToolCallTimeline,
  WidgetFor,
} from "./widgets";
import { UserBubble } from "./widgets/UserBubble";
import { UserMessageBody } from "./widgets/UserMessageBody";

interface IProps {
  message: Message;
  isTurnStart?: boolean;
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

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

const ACTION_BUTTON_CLASS =
  "p-1 rounded text-text-muted hover:text-text transition";

const focusOnMount = (node: HTMLTextAreaElement | null) => node?.focus();

function MessageBubbleBase({
  message,
  isTurnStart = false,
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
  const [draft, setDraft] = useState("");

  const isEmptyStreaming =
    isStreamingThis &&
    !message.content &&
    !message.thinking &&
    !message.toolCalls?.length;
  const isStillThinking = isStreamingThis && !message.content;
  const timelineCalls = (message.toolCalls ?? []).filter(
    (tc): tc is ToolActivity => !!tc && !isSteerActivity(tc),
  );
  const isFailed = !isUser && !isStreamingThis && isErrorTurn(message.content);
  const canRegenerate = !!onRegenerate && !isLoading;
  const createdAt = message.createdAt
    ? new Date(message.createdAt * 1000)
    : undefined;
  const time = createdAt?.toLocaleTimeString(undefined, TIME_FORMAT);
  const fullTime = createdAt?.toLocaleString();

  const handleEditStart = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const handleEditCommit = () => {
    setEditing(false);
    if (!draft.trim() || draft === message.content) return;
    onEditAndResend?.(message.id, draft, message.images);
  };

  const handleEditCancel = () => setEditing(false);

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEditCommit();
      return;
    }
    if (e.key !== "Escape") return;
    e.preventDefault();
    handleEditCancel();
  };

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setDraft(e.target.value);

  const handleThinkingToggle = () => setThinkingOpen((open) => !open);

  const handleRegenerate = () => onRegenerate?.(message.id);

  return (
    <div
      data-message-id={message.id}
      className={`group relative ${isTurnStart ? "pt-5" : "pt-1.5"} pb-1.5 px-6 ${
        isHighlighted ? "ring-2 ring-inset ring-accent/60" : ""
      }`}
    >
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
                onClick={handleEditStart}
                className={ACTION_BUTTON_CLASS}
                title="Edit & resend"
                aria-label="Edit and resend"
              >
                <Pencil size={13} />
              </button>
            )}
            {!isUser && canRegenerate && (
              <button
                onClick={handleRegenerate}
                className={ACTION_BUTTON_CLASS}
                title="Regenerate"
                aria-label="Regenerate response"
              >
                <RotateCw size={13} />
              </button>
            )}
          </span>
        )}
        <div className="max-w-3xl mx-auto">
          {isUser && !editing && (
            <div className="flex justify-end">
              <UserBubble>
                <MessageImages
                  images={message.images}
                  onImageClick={onImageClick}
                />
                <UserMessageBody content={message.content} />
              </UserBubble>
            </div>
          )}
          {editing && (
            <div className="mb-2">
              <textarea
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleEditKeyDown}
                ref={focusOnMount}
                rows={3}
                aria-label="Edit message"
                className="w-full bg-bg border border-border rounded-lg p-2 text-sm text-text outline-none focus:border-accent resize-y min-h-16"
              />
              <div className="flex items-center gap-2 mt-1.5 text-xs text-text-muted">
                <button
                  onClick={handleEditCommit}
                  className="px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover transition"
                >
                  Send
                </button>
                <button
                  onClick={handleEditCancel}
                  className="px-2 py-1 rounded hover:bg-surface-2 transition"
                >
                  Cancel
                </button>
                <span className="ml-auto">Enter to send · Esc to cancel</span>
              </div>
            </div>
          )}
          {!isUser && !editing && (
            <>
              {!isStreamingThis && (message.model || message.thinking) && (
                <div className="mb-1 text-[11px] text-text-muted/80 select-none">
                  {message.model ?? "Assistant"}
                </div>
              )}
              <MessageImages
                images={message.images}
                onImageClick={onImageClick}
              />
              {message.thinking && (
                <div className="mb-2">
                  <button
                    onClick={handleThinkingToggle}
                    aria-expanded={thinkingOpen}
                    className={`flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition ${
                      isStillThinking ? "animate-pulse" : ""
                    }`}
                  >
                    <Brain size={13} />
                    {isStillThinking ? "Thinking…" : "Thinking"}
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
              {timelineCalls.length > 0 && (
                <ToolCallTimeline
                  calls={timelineCalls}
                  isStreaming={isStreamingThis}
                />
              )}
              {isEmptyStreaming ? (
                <div className="flex items-center gap-1 py-1.5">
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              ) : (
                <>
                  <StreamingProvider value={isStreamingThis}>
                    {splitContentByWidgets(
                      message.content,
                      message.toolCalls ?? [],
                    ).map((segment) =>
                      segment.kind === "text" ? (
                        <MarkdownBody key={segment.id} content={segment.text} />
                      ) : (
                        <WidgetFor key={segment.id} widget={segment.widget} />
                      ),
                    )}
                  </StreamingProvider>
                  {isFailed && canRegenerate && (
                    <div className="mt-1.5">
                      <button
                        onClick={handleRegenerate}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-xs text-text-muted hover:text-text hover:bg-surface-2 transition"
                        title="Retry this response"
                        aria-label="Retry response"
                      >
                        <RotateCw size={12} />
                        Retry
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleBase);
