import { useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import { Edit3, Loader2, Pin, Trash2 } from "lucide-react";
import { fmtChatTime } from "@kotys/contracts";
import type { Chat } from "@kotys/core";

// Topic hue is an index, not decoration: the same topic always lands on the
// same dot colour so a column of dots becomes scannable. Kept clear of the
// orange accent, which is reserved for selection.
const TOPIC_DOT_CLASSES = [
  "bg-[#dc2626]",
  "bg-[#ea580c]",
  "bg-[#ca8a04]",
  "bg-[#16a34a]",
  "bg-[#0d9488]",
  "bg-[#0891b2]",
  "bg-[#7c3aed]",
  "bg-[#db2777]",
];

function topicDotClass(topic: string): string {
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = (hash * 31 + topic.charCodeAt(i)) >>> 0;
  }
  return TOPIC_DOT_CLASSES[hash % TOPIC_DOT_CLASSES.length];
}

const focusOnMount = (el: HTMLInputElement | null) => el?.focus();

interface IProps {
  chat: Chat;
  now: number;
  isActive: boolean;
  isPinned: boolean;
  isGenerating: boolean;
  onSelect: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
  onTogglePinned: (id: number) => void;
}

export function ChatRow({
  chat,
  now,
  isActive,
  isPinned,
  isGenerating,
  onSelect,
  onRename,
  onDelete,
  onTogglePinned,
}: IProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  // Removing the focused field fires blur; an Escape must not save through it.
  const isCancelling = useRef(false);
  const [primaryTopic, ...otherTopics] = chat.topics;
  const tooltip = [
    chat.title,
    chat.topics.length > 0 ? chat.topics.join(" · ") : null,
    chat.llmModel?.name,
  ]
    .filter(Boolean)
    .join("\n");

  const commitRename = () => {
    setIsEditing(false);
    if (isCancelling.current) {
      isCancelling.current = false;
      return;
    }
    onRename(chat.id, titleInput);
  };

  const handleSelect = () => onSelect(chat.id);

  const handleRowKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onSelect(chat.id);
  };

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) =>
    setTitleInput(e.target.value);

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
      return;
    }
    if (e.key !== "Escape") return;
    isCancelling.current = true;
    e.currentTarget.blur();
  };

  const handleTogglePinned = (e: MouseEvent) => {
    e.stopPropagation();
    onTogglePinned(chat.id);
  };

  const handleStartRename = (e: MouseEvent) => {
    e.stopPropagation();
    setTitleInput(chat.title);
    setIsEditing(true);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    onDelete(chat.id);
  };

  const stopClick = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      title={isEditing ? undefined : tooltip}
      onKeyDown={handleRowKeyDown}
      className={`group relative rounded-md cursor-pointer transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-accent ${
        isActive ? "bg-surface-user" : "hover:bg-surface-2/70"
      }`}
      onClick={handleSelect}
    >
      {isActive && (
        <span
          className="absolute right-0 top-1 bottom-1 w-0.5 rounded-full bg-accent"
          aria-hidden="true"
        />
      )}

      <div className="pl-2.5 pr-2 py-1.5">
        {isEditing ? (
          <input
            type="text"
            value={titleInput}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            onBlur={commitRename}
            onClick={stopClick}
            aria-label="Rename chat"
            ref={focusOnMount}
            className="w-full bg-transparent text-[14px] outline-none border-b border-accent"
          />
        ) : (
          <div
            className={`text-[14px] leading-[1.3] line-clamp-2 ${
              isActive ? "text-text font-medium" : "text-text"
            }`}
          >
            {chat.title}
          </div>
        )}

        <div className="mt-1 flex items-center gap-1 text-[11px] leading-none text-text-muted">
          {isPinned && (
            <Pin
              size={10}
              fill="currentColor"
              className="shrink-0 text-accent"
              aria-hidden="true"
            />
          )}
          {primaryTopic && (
            <>
              <span
                className={`h-[5px] w-[5px] shrink-0 rounded-full ${topicDotClass(primaryTopic)}`}
                aria-hidden="true"
              />
              <span className="truncate">{primaryTopic}</span>
              {otherTopics.map((topic) => (
                <span
                  key={topic}
                  className={`h-[5px] w-[5px] shrink-0 rounded-full ${topicDotClass(topic)}`}
                  aria-hidden="true"
                />
              ))}
              <span className="shrink-0 opacity-40">·</span>
            </>
          )}
          <span className="shrink-0">{fmtChatTime(chat.updated_at, now)}</span>
          {isGenerating && (
            <Loader2
              size={11}
              className="shrink-0 animate-spin text-accent"
              aria-label="Generating"
            />
          )}
        </div>
      </div>

      {/* Overlaid rather than in flow, so hovering a row never reflows its title. */}
      <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded bg-surface-2 pl-1.5 group-hover:flex group-focus-within:flex">
        <button
          onClick={handleTogglePinned}
          aria-label={isPinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
          title={isPinned ? "Unpin" : "Pin to top"}
          className={`p-1 transition-colors ${
            isPinned ? "text-accent" : "text-text-muted hover:text-text"
          }`}
        >
          <Pin size={12} fill={isPinned ? "currentColor" : "none"} />
        </button>
        <button
          onClick={handleStartRename}
          aria-label={`Rename ${chat.title}`}
          title="Rename"
          className="p-1 text-text-muted transition-colors hover:text-text"
        >
          <Edit3 size={12} />
        </button>
        <button
          onClick={handleDelete}
          aria-label={`Delete ${chat.title}`}
          title="Delete"
          className="p-1 text-text-muted transition-colors hover:text-red-500"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
