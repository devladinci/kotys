import {
  memo,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { BarChart2, Plus, Search, Settings, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  generatingChatIdsSnapshot,
  subscribeGenerating,
  useNow,
  type Chat,
} from "@kotys/core";
import type { SearchResultRow } from "@kotys/contracts";
import { renderSnippet } from "../widgets";
import { ChatRow } from "./ChatRow";
import { ChatSection } from "./ChatSection";

const DATE_TICK_MS = 30_000;

// Chats with a live stream, from the daemon's progress heartbeats.
function useGeneratingChatIds(): number[] {
  return useSyncExternalStore(
    subscribeGenerating,
    generatingChatIdsSnapshot,
    generatingChatIdsSnapshot,
  );
}

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
  const generatingChatIds = useGeneratingChatIds();

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

  const handleToggleSection = useCallback((label: string) => {
    setExpandedPast((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) =>
    onSearchChange(e.target.value);

  const handleClearSearch = () => onSearchChange("");

  const renderSection = (label: string, items: Chat[]) => (
    <ChatSection
      key={label}
      label={label}
      count={items.length}
      isCollapsed={collapsedBuckets.has(label)}
      onToggle={handleToggleSection}
    >
      {items.map((chat) => (
        <ChatRow
          key={chat.id}
          chat={chat}
          now={now}
          isActive={activeChatId === chat.id}
          isPinned={pinnedChatIds.has(chat.id)}
          isGenerating={generatingChatIds.includes(chat.id)}
          onSelect={onSelectChat}
          onRename={onRenameChat}
          onDelete={onDeleteChat}
          onTogglePinned={onTogglePinned}
        />
      ))}
    </ChatSection>
  );

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
            onChange={handleSearchChange}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder-text-muted"
            title="Search chats (⌘F)"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
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
            searchResults.map((r) => (
              <button
                key={r.id}
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
