import { memo, useMemo, useState, type CSSProperties } from "react";
import { fmtChatTime } from "@kotys/contracts";
import {
  BarChart2,
  ChevronDown,
  Edit3,
  Pin,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useNow, type Chat } from "@kotys/core";
import type { SearchResultRow } from "@kotys/contracts";
import { renderSnippet } from "./widgets";

/** Date labels ("5m ago", Today/Yesterday) tick on this clock. */
const DATE_TICK_MS = 30_000;

interface IProps {
  chats: Chat[];
  activeChatId: number | null;
  searchQuery: string;
  searchResults: SearchResultRow[] | null;
  pinnedChatIds: Set<number>;
  onCreateChat: () => void;
  onSelectChat: (id: number) => void;
  onDeleteChat: (id: number) => void;
  onRenameChat: (id: number, title: string) => void;
  onSearchChange: (q: string) => void;
  onOpenSearchResult: (r: SearchResultRow) => void;
  onTogglePinned: (id: number) => void;
  onOpenSettings: () => void;
  onOpenAnalytics: () => void;
}

// Topic hue is an index, not decoration: the same topic always lands on the
// same dot colour so a column of dots becomes scannable. Kept clear of the
// orange accent, which is reserved for selection.
const TOPIC_COLORS = [
  "#dc2626", // red
  "#ea580c", // orange
  "#ca8a04", // amber
  "#16a34a", // green
  "#0d9488", // teal
  "#0891b2", // cyan
  "#7c3aed", // violet
  "#db2777", // pink
];

function topicColor(topic: string): string {
  let hash = 0;
  for (let i = 0; i < topic.length; i++)
    hash = (hash * 31 + topic.charCodeAt(i)) >>> 0;
  return TOPIC_COLORS[hash % TOPIC_COLORS.length];
}

function timeBucket(epochSec: number, nowMs: number): string {
  const d = new Date(epochSec * 1000);
  const now = new Date(nowMs);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return "Yesterday";
  const diffDays = Math.floor((nowMs - d.getTime()) / 86_400_000);
  if (diffDays < 7) return "This Week";
  if (diffDays < 30) return "This Month";
  return "Earlier";
}

const BUCKET_ORDER = [
  "Today",
  "Yesterday",
  "This Week",
  "This Month",
  "Earlier",
];

function SidebarBase({
  chats,
  activeChatId,
  searchQuery,
  searchResults,
  pinnedChatIds,
  onCreateChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
  onSearchChange,
  onOpenSearchResult,
  onTogglePinned,
  onOpenSettings,
  onOpenAnalytics,
}: IProps) {
  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const isAnalyticsRoute = location.pathname.startsWith("/analytics");
  const now = useNow(DATE_TICK_MS);
  // Rename editing lives here, not in App: the input value and the "which
  // row is being edited" pointer change together on every keystroke.
  const [editingTitle, setEditingTitle] = useState<number | null>(null);
  const [titleInput, setTitleInput] = useState("");

  // Older days/weeks stay collapsed while there is an active Today group to
  // show; each section's chevron opens it individually. State is a manual
  // expansion set, so it survives the 30s date tick that recreates `buckets`.
  const [expandedPast, setExpandedPast] = useState<Set<string>>(new Set());
  const { pinnedChats, buckets, collapsedBuckets } = useMemo(() => {
    const pinned = chats
      .filter((c) => pinnedChatIds.has(c.id))
      .sort((a, b) => b.updated_at - a.updated_at);
    const rest = chats
      .filter((c) => !pinnedChatIds.has(c.id))
      .sort((a, b) => b.updated_at - a.updated_at);
    const map = new Map<string, Chat[]>();
    for (const chat of rest) {
      const bucket = timeBucket(chat.updated_at, now);
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(chat);
    }
    const ordered = BUCKET_ORDER.filter((b) => map.has(b)).map(
      (b) => [b, map.get(b)!] as [string, Chat[]],
    );
    const collapsePast = (map.get("Today")?.length ?? 0) > 1;
    const collapsed = new Set(
      collapsePast
        ? ordered
            .slice(1)
            .filter(([b]) => !expandedPast.has(b))
            .map(([b]) => b)
        : [],
    );
    return {
      pinnedChats: pinned,
      buckets: ordered,
      collapsedBuckets: collapsed,
    };
  }, [chats, pinnedChatIds, now, expandedPast]);

  const renderChatItem = (chat: Chat) => {
    const isActive = activeChatId === chat.id;
    const isPinned = pinnedChatIds.has(chat.id);
    const [primaryTopic, ...otherTopics] = chat.topics;
    const isEditing = editingTitle === chat.id;
    const tooltip = [
      chat.title,
      chat.topics.length > 0 ? chat.topics.join(" · ") : null,
      chat.llmModel?.name,
    ]
      .filter(Boolean)
      .join("\n");

    return (
      <div
        key={chat.id}
        role="button"
        tabIndex={0}
        title={isEditing ? undefined : tooltip}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectChat(chat.id);
          }
        }}
        className={`group relative rounded-md cursor-pointer transition-colors duration-100 outline-none focus-visible:ring-1 focus-visible:ring-accent ${
          isActive ? "bg-surface-user" : "hover:bg-surface-2/70"
        }`}
        onClick={() => onSelectChat(chat.id)}
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
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRenameChat(chat.id, titleInput);
                  setEditingTitle(null);
                }
                if (e.key === "Escape") setEditingTitle(null);
              }}
              onBlur={() => {
                onRenameChat(chat.id, titleInput);
                setEditingTitle(null);
              }}
              aria-label="Rename chat"
              ref={(el) => el?.focus()}
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
                  className="h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ backgroundColor: topicColor(primaryTopic) }}
                  aria-hidden="true"
                />
                <span className="truncate">{primaryTopic}</span>
                {otherTopics.map((topic) => (
                  <span
                    key={topic}
                    className="h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{ backgroundColor: topicColor(topic) }}
                    aria-hidden="true"
                  />
                ))}
                <span className="shrink-0 opacity-40">·</span>
              </>
            )}
            <span className="shrink-0">
              {fmtChatTime(chat.updated_at, now)}
            </span>
          </div>
        </div>

        {/* Overlaid rather than in flow, so hovering a row never reflows its title. */}
        <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded bg-surface-2 pl-1.5 group-hover:flex group-focus-within:flex">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinned(chat.id);
            }}
            aria-label={isPinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
            title={isPinned ? "Unpin" : "Pin to top"}
            className={`p-1 transition-colors ${
              isPinned ? "text-accent" : "text-text-muted hover:text-text"
            }`}
          >
            <Pin size={12} fill={isPinned ? "currentColor" : "none"} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingTitle(chat.id);
              setTitleInput(chat.title);
            }}
            aria-label={`Rename ${chat.title}`}
            title="Rename"
            className="p-1 text-text-muted transition-colors hover:text-text"
          >
            <Edit3 size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteChat(chat.id);
            }}
            aria-label={`Delete ${chat.title}`}
            title="Delete"
            className="p-1 text-text-muted transition-colors hover:text-red-500"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  };

  const renderSection = (label: string, items: Chat[]) => {
    const isCollapsed = collapsedBuckets.has(label);
    return (
      <div key={label}>
        {/* Sticky, so the bucket a row belongs to stays readable while scrolling. */}
        <button
          onClick={() =>
            setExpandedPast((prev) => {
              const next = new Set(prev);
              if (next.has(label)) next.delete(label);
              else next.add(label);
              return next;
            })
          }
          aria-expanded={!isCollapsed}
          className="sticky top-0 z-10 flex w-full items-center gap-1 bg-bg px-2.5 pb-1 pt-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/70 transition-colors hover:text-text-muted"
        >
          <span>{label}</span>
          <ChevronDown
            size={11}
            aria-hidden="true"
            className={`shrink-0 transition-transform duration-200 ${
              isCollapsed ? "-rotate-90" : ""
            }`}
          />
          {/* flex-1 spacer pushes the counter to the far right edge. */}
          <span className="flex-1" />
          {/* Kept in flow but faded, so the header width doesn't jump on toggle. */}
          <span
            aria-hidden={!isCollapsed}
            className={`normal-case tracking-normal text-text-muted/50 transition-opacity duration-200 ${
              isCollapsed ? "opacity-100" : "opacity-0"
            }`}
          >
            {items.length}
          </span>
        </button>
        {/* grid-template-rows 0fr→1fr animates height without measuring
            content; rows stay mounted but inert, so keyboard focus can't land
            inside a collapsed section. */}
        <div
          inert={isCollapsed}
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: isCollapsed ? "0fr" : "1fr" }}
        >
          <div className="overflow-hidden">{items.map(renderChatItem)}</div>
        </div>
      </div>
    );
  };

  return (
    <aside
      aria-label="Chat list"
      className="sidebar-enter flex w-64 flex-col border-r border-border bg-bg"
    >
      <div
        className="flex items-center gap-1.5 px-2.5 pb-2 pt-10"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md bg-surface-2 px-2 transition focus-within:ring-1 focus-within:ring-accent"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <Search size={13} className="shrink-0 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder-text-muted"
            title="Search chats (⌘F)"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="text-text-muted transition-colors hover:text-text"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={onCreateChat}
          aria-label="New chat"
          title="New chat (⌘N)"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-text-muted transition-colors hover:bg-border hover:text-text"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <Plus size={15} />
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-1.5 pb-2">
        {searchQuery.trim() ? (
          searchResults === null ? (
            <div className="px-2.5 py-2 text-xs text-text-muted">
              Searching…
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-text-muted">
              No chats match “{searchQuery.trim()}”
            </div>
          ) : (
            searchResults.map((r, i) => (
              <button
                key={`${r.id}-${i}`}
                onClick={() => onOpenSearchResult(r)}
                className="w-full rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2/70"
              >
                <div className="truncate text-[14px] leading-[1.3]">
                  {r.title}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[12px] leading-[1.4] text-text-muted">
                  {r.role === "user" ? "You: " : ""}
                  {renderSnippet(r.snippet)}
                </div>
              </button>
            ))
          )
        ) : (
          <>
            {pinnedChats.length > 0 && renderSection("Pinned", pinnedChats)}
            {buckets.map(([label, items]) => renderSection(label, items))}
          </>
        )}
      </nav>

      <div className="border-t border-border px-2.5 py-2">
        <button
          onClick={onOpenAnalytics}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[14px] transition-colors ${
            isAnalyticsRoute
              ? "bg-surface-2 font-medium text-text"
              : "text-text-muted hover:bg-surface-2/70 hover:text-text"
          }`}
        >
          <BarChart2
            size={14}
            className={isAnalyticsRoute ? "text-accent" : ""}
          />
          Analytics
        </button>
        <button
          onClick={onOpenSettings}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[14px] transition-colors ${
            isSettingsRoute
              ? "bg-surface-2 font-medium text-text"
              : "text-text-muted hover:bg-surface-2/70 hover:text-text"
          }`}
        >
          <Settings
            size={14}
            className={isSettingsRoute ? "text-accent" : ""}
          />
          Settings
        </button>
      </div>
    </aside>
  );
}

const Sidebar = memo(SidebarBase);
export default Sidebar;
