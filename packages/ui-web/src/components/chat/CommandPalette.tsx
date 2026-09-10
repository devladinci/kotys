import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MessageSquare,
  Moon,
  PanelRight,
  Plus,
  Search,
  Settings,
  Sun,
  Timer,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppStore, usePomodoroStore, useTodoStore } from "@kotys/core";
import type { Chat } from "@kotys/core";
interface IProps {
  chats: Chat[];
  onSelectChat: (id: number) => void;
  onCreateChat: () => void | Promise<void>;
  onClose: () => void;
}

type Item = {
  key: string;
  label: string;
  hint?: string;
  Icon: typeof MessageSquare;
  run: () => void;
};

/** ⌘K launcher: global actions plus jump-to-chat, in one flat list.
 *  Arrow keys move, Enter runs, Escape closes; ⌘K toggles it everywhere. */
function CommandPaletteBase({
  chats,
  onSelectChat,
  onCreateChat,
  onClose,
}: IProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useAppStore();

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const commands: Item[] = [
      {
        key: "new-chat",
        label: "New chat",
        hint: "⌘N",
        Icon: Plus,
        run: () => void onCreateChat(),
      },
      {
        key: "toggle-theme",
        label:
          resolvedTheme === "dark"
            ? "Switch to light theme"
            : "Switch to dark theme",
        Icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => void setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        key: "toggle-panel",
        label: "Toggle tasks side panel",
        hint: "⌘⇧T",
        Icon: PanelRight,
        run: () => {
          const s = useTodoStore.getState();
          s.setSidebarOpen(!s.sidebarOpen);
        },
      },
      {
        key: "focus-timer",
        label: "Show focus timer",
        hint: "⌘⇧P",
        Icon: Timer,
        run: () => {
          const pomodoro = usePomodoroStore.getState();
          if (!useTodoStore.getState().sidebarOpen) {
            pomodoro.reveal();
          } else {
            pomodoro.setCollapsed(!pomodoro.collapsed);
          }
        },
      },
      {
        key: "settings",
        label: "Open settings",
        hint: "⌘,",
        Icon: Settings,
        run: () => navigate("/settings"),
      },
    ];
    const matchedCommands = commands.filter(
      (item) =>
        !q ||
        item.label.toLowerCase().includes(q) ||
        item.key.includes(q.replace(/\s/g, "-")),
    );
    const chatItems: Item[] = chats
      .filter((c) => c.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({
        key: `chat-${c.id}`,
        label: c.title,
        Icon: MessageSquare,
        run: () => onSelectChat(c.id),
      }));
    return [...matchedCommands, ...chatItems];
  }, [
    chats,
    query,
    resolvedTheme,
    setTheme,
    onCreateChat,
    onSelectChat,
    navigate,
  ]);

  const clamped = Math.min(active, Math.max(items.length - 1, 0));
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${clamped}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [clamped]);
  useEffect(() => {
    // Focus after mount: the input is conditionally rendered by the parent.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const run = (item: Item) => {
    onClose();
    item.run();
  };

  // Stable so React doesn't detach/re-attach it each render (which re-focuses
  // the overlay on every keystroke and steals focus from the input).
  const focusOverlay = useCallback((el: HTMLDivElement | null) => {
    el?.focus();
  }, []);

  return createPortal(
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- modal dismiss overlay */
    <div
      ref={focusOverlay}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[15vh] outline-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-[480px] max-w-[90vw] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search size={14} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && items[clamped]) {
                e.preventDefault();
                run(items[clamped]);
              }
            }}
            placeholder="Type a command or search chats…"
            aria-label="Command palette search"
            className="flex-1 min-w-0 bg-transparent text-sm text-text placeholder-text-muted outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[10px] text-text-muted">
            esc
          </kbd>
        </div>
        <div
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-72 overflow-y-auto scrollbar-thin p-1.5"
        >
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-text-muted">
              No matches
            </div>
          )}
          {items.map((item, i) => (
            <button
              key={item.key}
              data-index={i}
              role="option"
              aria-selected={i === clamped}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(item)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-sm transition ${
                i === clamped ? "bg-surface-2" : ""
              }`}
            >
              <item.Icon
                size={14}
                className={i === clamped ? "text-accent" : "text-text-muted"}
              />
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {item.hint && (
                <kbd className="shrink-0 px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[10px] text-text-muted">
                  {item.hint}
                </kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    /* eslint-enable jsx-a11y/no-noninteractive-element-interactions */
    document.body,
  );
}

const CommandPalette = memo(CommandPaletteBase);
export default CommandPalette;
