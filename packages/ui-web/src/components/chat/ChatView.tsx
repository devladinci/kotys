import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  Check,
  ChevronDown,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
} from "lucide-react";
import type { Chat } from "@kotys/core";
import type { ModelListing, SearchResultRow } from "@kotys/contracts";
import { useAppStore } from "@kotys/core";
import { useTodoStore } from "@kotys/core";
import { useChat } from "@kotys/core";
import { useTokenEstimator } from "@kotys/core";
import { useUserInputStore } from "@kotys/core";
import { DEFAULT_CONTEXT } from "@kotys/contracts";
import PomodoroChip from "../pomodoro/PomodoroChip";
import MessageList from "./MessageList";
import Composer from "../composer";
import UserInputComposer from "../user-input/UserInputComposer";
import ModelSelector from "./ModelSelector";
import ThinkingSelector from "./ThinkingSelector";
import ModeSelector from "./ModeSelector";
import TokenBadge from "./TokenBadge";
import AnalyticsStrip from "../analytics/AnalyticsStrip";

const topicColor = (topic: string) => {
  let hash = 0;
  for (let i = 0; i < topic.length; i++)
    hash = (hash * 31 + topic.charCodeAt(i)) >>> 0;
  const hue = Math.round((hash * 137.508) % 360);
  const sat = 60 + ((hash >> 8) % 26);
  const light = 60 + ((hash >> 16) % 14);
  return {
    text: `hsl(${hue} ${sat}% ${light}%)`,
    bg: `hsl(${hue} ${sat}% 55% / 0.16)`,
  };
};

interface IProps {
  activeChat: Chat | undefined;
  activeChatId: number | null;
  defaultModel: ModelListing;
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
  onCreateChat: () => void;
  onChatCreated?: (id: number) => void;
  onTopicsInferred?: (id: number) => void;
  onTitleInferred?: (id: number) => void;
  onSummaryChanged?: () => void;
  onSelectModel: (model: ModelListing) => void | Promise<void>;
  openSearchResultRef?: React.MutableRefObject<
    ((r: SearchResultRow) => void) | null
  >;
}

export default function ChatView({
  activeChat,
  activeChatId,
  defaultModel,
  sidebarHidden,
  onToggleSidebar,
  onCreateChat,
  onChatCreated,
  onTopicsInferred,
  onTitleInferred,
  onSummaryChanged,
  onSelectModel,
  openSearchResultRef,
}: IProps) {
  const chatModel = activeChat?.llmModel ?? defaultModel;
  const inputPending = useUserInputStore((s) => s.pending);
  const {
    messages,
    isLoading,
    streamingId,
    highlightId,
    send,
    abort,
    openSearchResult,
    compactNow,
    isCompacting,
    regenerate,
    editAndResend,
    queuedMessages,
    dequeue,
    steer,
  } = useChat({
    activeChatId,
    chatSummary: activeChat?.summary ?? null,
    chatSummaryUpto: activeChat?.summary_upto ?? null,
    chatModel,
    chatTitle: activeChat?.title ?? "New chat",
    chatTopics: activeChat?.topics ?? [],
    onChatCreated,
    onTopicsInferred,
    onTitleInferred,
    onSummaryChanged,
  });

  const { used, pct, ctx } = useTokenEstimator(
    messages,
    chatModel.contextLength ?? DEFAULT_CONTEXT,
    {
      summary: activeChat?.summary ?? null,
      summaryUpto: activeChat?.summary_upto ?? null,
    },
  );
  const { apiKeyPresent } = useAppStore();
  const railOpen = useTodoStore((s) => s.sidebarOpen);
  const navigate = useNavigate();

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [compactNotice, setCompactNotice] = useState<
    "compacted" | "nothing" | "error" | null
  >(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const compactNoticeTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(
    () => () => clearTimeout(compactNoticeTimer.current ?? undefined),
    [],
  );

  const startNoticeTimeout = () => {
    clearTimeout(compactNoticeTimer.current ?? undefined);
    compactNoticeTimer.current = setTimeout(() => {
      setCompactNotice(null);
      setSummaryOpen(false);
    }, 3000);
  };

  const handleCompact = async () => {
    if (isCompacting) return;
    setCompactNotice(null);
    setSummaryOpen(false);
    const result = await compactNow();
    setCompactNotice(result);
    startNoticeTimeout();
  };

  const toggleSummaryOpen = () => {
    setSummaryOpen((open) => {
      // Reading the summary pauses the auto-dismiss; closing resumes it.
      if (!open) clearTimeout(compactNoticeTimer.current ?? undefined);
      else startNoticeTimeout();
      return !open;
    });
  };

  useEffect(() => {
    if (!openSearchResultRef) return;
    openSearchResultRef.current = (r: SearchResultRow) => {
      openSearchResult(r, activeChatId);
    };
    return () => {
      if (openSearchResultRef) openSearchResultRef.current = null;
    };
  }, [openSearchResult, activeChatId, openSearchResultRef]);

  const setPinned = useCallback((value: boolean) => {
    atBottomRef.current = value;
    setAtBottom(value);
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleImageClick = useCallback((src: string) => {
    setLightboxImage(src);
  }, []);

  const handleSend = useCallback(
    async (text: string, images: string[]) => {
      // A send is an explicit "show me the latest" signal — re-pin even if
      // the user had scrolled up (ChatGPT/iMessage behavior). The optimistic
      // user bubble appears immediately, so pin before the state update.
      atBottomRef.current = true;
      setAtBottom(true);
      const res = await send(text, images);
      if (res?.needsSettings) {
        navigate("/settings");
      }
      scrollToBottom();
    },
    [send, navigate, scrollToBottom],
  );

  const visionCapable = chatModel.capabilities.includes("vision");
  const compactUpto = activeChat?.summary ? (activeChat.summary_upto ?? 0) : 0;

  if (activeChatId === null) {
    return (
      <main className="flex-1 flex flex-col min-w-0">
        <header
          className="pt-10 px-4 pb-3 border-b border-border bg-surface flex items-center gap-2 flex-shrink-0"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
        >
          <button
            onClick={() => onToggleSidebar?.()}
            aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
            title={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          >
            {sidebarHidden ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-text mb-3">Kotys</h1>
            <p className="text-base">
              Private, local-storage chat with Ollama Cloud models.
            </p>
          </div>
          <button
            onClick={onCreateChat}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition"
          >
            <Plus size={18} />
            Start a new chat
          </button>
          <AnalyticsStrip />
          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-text-muted">
            <div className="flex items-center gap-2 justify-end">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">
                ⌘K
              </kbd>
              <span>Command palette</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">
                ⌘N
              </kbd>
              <span>New chat</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">
                ⌘F
              </kbd>
              <span>Search chats</span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">
                ⌘/
              </kbd>
              <span>Focus composer</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">
                ⌘,
              </kbd>
              <span>Settings</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0">
      <header
        className="pt-10 px-4 pb-3 border-b border-border bg-surface flex items-center gap-3 flex-shrink-0 relative"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <button
          onClick={() => onToggleSidebar?.()}
          aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
          title={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
          className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {sidebarHidden ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </button>
        <h1 className="flex-1 min-w-0 text-[15px] font-semibold truncate">
          {activeChat?.title ?? "New chat"}
        </h1>
        {activeChat && activeChat.topics.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {activeChat.topics.map((topic) => {
              const color = topicColor(topic);
              return (
                <span
                  key={topic}
                  className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                  style={{ backgroundColor: color.bg, color: color.text }}
                >
                  {topic}
                </span>
              );
            })}
          </div>
        )}
        <PomodoroChip />
        {/* The rail holds Focus and Tasks, so this is a panel toggle that
            mirrors the left sidebar's, not a control named after one of the
            two sections inside it. */}
        <button
          onClick={() => useTodoStore.getState().setSidebarOpen(!railOpen)}
          aria-label={railOpen ? "Hide side panel" : "Show side panel"}
          aria-expanded={railOpen}
          title={railOpen ? "Hide side panel (⌘⇧T)" : "Show side panel (⌘⇧T)"}
          className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text transition flex-shrink-0"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          {railOpen ? (
            <PanelRightClose size={16} />
          ) : (
            <PanelRightOpen size={16} />
          )}
        </button>
      </header>
      <div className="flex-1 relative min-h-0">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto scrollbar-thin"
          onWheel={(e) => {
            const el = e.currentTarget;
            if (e.deltaY < 0 && el.scrollHeight > el.clientHeight + 4)
              setPinned(false);
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (near !== atBottomRef.current) setPinned(near);
          }}
        >
          <MessageList
            messages={messages}
            streamingId={streamingId}
            highlightId={highlightId}
            compactUpto={compactUpto}
            summary={activeChat?.summary ?? null}
            onImageClick={handleImageClick}
            onRegenerate={regenerate}
            onEditAndResend={editAndResend}
            isLoading={isLoading}
            onPickExample={(text) => void handleSend(text, [])}
          />
          {isLoading && streamingId === null && (
            <div className="py-3 px-6 bg-surface">
              <div className="max-w-3xl mx-auto flex gap-4">
                <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-semibold text-white">
                  AI
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
        </div>
        {!atBottom && (
          <button
            onClick={() => {
              setPinned(true);
              scrollToBottom(true);
            }}
            title="Jump to latest"
            aria-label="Jump to latest"
            className="absolute bottom-4 right-6 p-2 rounded-full bg-surface-2 border border-border shadow-lg hover:bg-border transition"
          >
            <ArrowDown size={16} />
          </button>
        )}
      </div>

      <div className="p-3 border-t border-border bg-bg">
        <div className="max-w-3xl mx-auto">
          {(isCompacting || compactNotice) && (
            <div
              className="relative mb-2 flex justify-center"
              role="status"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-2 border border-border text-[11px] text-text-muted">
                {isCompacting ? (
                  <>
                    <Loader2 size={11} className="animate-spin text-accent" />
                    Compacting context — summarizing older messages…
                  </>
                ) : compactNotice === "compacted" ? (
                  <button
                    onClick={toggleSummaryOpen}
                    className="flex items-center gap-1.5 hover:text-text transition"
                    aria-expanded={summaryOpen}
                    title="Show the compaction summary"
                  >
                    <Check size={11} className="text-accent" />
                    Context compacted
                    <ChevronDown
                      size={10}
                      className={`transition ${summaryOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : compactNotice === "error" ? (
                  <span className="text-red-400">
                    Compaction failed — try again
                  </span>
                ) : (
                  "Nothing to compact — conversation is short"
                )}
              </span>
              {summaryOpen && compactNotice === "compacted" && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-md rounded-xl border border-border bg-surface shadow-xl z-40 p-1.5">
                  <div className="max-h-56 overflow-y-auto scrollbar-thin p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-text-muted text-left">
                    {activeChat?.summary}
                  </div>
                </div>
              )}
            </div>
          )}
          <UserInputComposer />
          {!inputPending && (
            <Composer
              isApiKeyMissing={chatModel.source === "cloud" && !apiKeyPresent}
              modelName={chatModel.name}
              isVisionCapable={visionCapable}
              hasMessages={messages.length > 0}
              isLoading={isLoading}
              streamingId={streamingId}
              queuedMessages={queuedMessages}
              onSend={handleSend}
              onAbort={abort}
              onDequeue={dequeue}
              onSteer={steer}
            />
          )}
          <div className="relative flex items-center mt-1.5 text-[11px] text-text-muted">
            <div
              className="inline-flex items-center rounded-md border border-border bg-surface py-0.5"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              <ModelSelector onSelect={onSelectModel} compact />
              {chatModel.capabilities.includes("thinking") && (
                <ThinkingSelector />
              )}
              <ModeSelector />
            </div>
            <span className="flex-1" />
            {used > 0 && (
              <TokenBadge
                used={used}
                pct={pct}
                ctx={ctx}
                compacted={!!activeChat?.summary}
                isCompacting={isCompacting}
                onCompact={() => void handleCompact()}
              />
            )}
          </div>
        </div>
      </div>

      {lightboxImage && (
        /* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- modal dismiss overlay */
        <div
          ref={(el) => el?.focus()}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-zoom-out"
          onClick={() => setLightboxImage(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") {
              setLightboxImage(null);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          tabIndex={-1}
        >
          <img
            src={lightboxImage}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] rounded-lg"
          />
        </div>
      )}
    </main>
  );
}
