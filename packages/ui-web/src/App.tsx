import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAppStore } from "@kotys/core";
import {
  useTodoStore,
  subscribeTodoChanges,
  subscribeChatSync,
} from "@kotys/core";
import {
  subscribePomodoro,
  subscribeToolApprovals,
  subscribeUserInput,
  usePomodoroStore,
} from "@kotys/core";
import { useChatList } from "@kotys/core";
import { useSettings } from "@kotys/core";
import { usePlatform } from "@kotys/core";
import { useTheme } from "./hooks/useTheme";
import { useNotifications } from "./hooks/useNotifications";
import {
  useKeyboardShortcuts,
  focusComposer,
} from "./hooks/useKeyboardShortcuts";
import { useRpc } from "@kotys/core";
import type { SearchResultRow } from "@kotys/contracts";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/chat/Sidebar";
import ChatView from "./components/chat/ChatView";
import ApprovalPrompt from "./components/chat/ApprovalPrompt";
import CommandPalette from "./components/chat/CommandPalette";
import TodoSidebar from "./components/todos/TodoSidebar";
import SettingsLayout from "./components/settings/SettingsLayout";
import AnalyticsPage from "./components/analytics";
import GeneralSettings from "./components/settings/GeneralSettings";
import ToolsSettings from "./components/settings/ToolsSettings";
import McpSettings from "./components/settings/McpSettings";
import SkillsSettings from "./components/settings/SkillsSettings";
import MemorySettings from "./components/settings/MemorySettings";
import PomodoroSettings from "./components/settings/PomodoroSettings";
import VoiceSettings from "./components/settings/VoiceSettings";

function ChatRoute() {
  const { chatId } = useParams<{ chatId: string }>();
  const id = chatId ? Number(chatId) : null;
  const {
    setActiveChatId,
    activeChatId,
    sidebarHidden,
    setSidebarHidden,
    defaultModel,
  } = useAppStore();
  const { chats, loaded, createChat, selectModelForActiveChat } = useChatList();
  const { bumpChatsVersion } = useAppStore();
  const navigate = useNavigate();
  const openSearchResultRef = useRef<((r: SearchResultRow) => void) | null>(
    null,
  );

  useEffect(() => {
    if (id !== null && id !== activeChatId) {
      setActiveChatId(id);
    }
  }, [id, activeChatId, setActiveChatId]);

  // The chat under this route disappeared (deleted here or from another
  // client) — leave instead of rendering a dead chat against a stale id.
  useEffect(() => {
    if (id !== null && loaded && !chats.some((c) => c.id === id)) {
      navigate("/", { replace: true });
    }
  }, [id, loaded, chats, navigate]);

  const handleCreateChat = useCallback(async () => {
    const newId = await createChat();
    navigate(`/chat/${newId}`);
    focusComposer();
  }, [createChat, navigate]);

  const activeChat = useMemo(() => chats.find((c) => c.id === id), [chats, id]);

  return (
    <ChatView
      activeChat={activeChat}
      activeChatId={id}
      defaultModel={defaultModel}
      sidebarHidden={sidebarHidden}
      onToggleSidebar={() => setSidebarHidden(!sidebarHidden)}
      onCreateChat={() => void handleCreateChat()}
      onChatCreated={(newId) => setActiveChatId(newId)}
      onTopicsInferred={bumpChatsVersion}
      onTitleInferred={bumpChatsVersion}
      onSummaryChanged={bumpChatsVersion}
      onSelectModel={selectModelForActiveChat}
      openSearchResultRef={openSearchResultRef}
    />
  );
}

function IndexRoute() {
  const { activeChatId, setActiveChatId, defaultModel } = useAppStore();
  const { chats, createChat } = useChatList();
  const navigate = useNavigate();

  useEffect(() => {
    if (activeChatId !== null && chats.some((c) => c.id === activeChatId)) {
      navigate(`/chat/${activeChatId}`, { replace: true });
    } else if (chats.length > 0) {
      // activeChatId points at a deleted (or not-yet-loaded) chat.
      setActiveChatId(chats[0].id);
      navigate(`/chat/${chats[0].id}`, { replace: true });
    } else if (activeChatId !== null) {
      // Last chat deleted: clear the stale pointer, stay on the welcome state.
      setActiveChatId(null);
    }
  }, [activeChatId, chats, navigate, setActiveChatId]);

  return (
    <ChatView
      activeChat={undefined}
      activeChatId={null}
      defaultModel={defaultModel}
      onCreateChat={() => void createChat()}
      onChatCreated={(newId) => {
        setActiveChatId(newId);
        navigate(`/chat/${newId}`);
      }}
      onSelectModel={async () => undefined}
    />
  );
}

function GeneralRoute() {
  const { theme, setTheme } = useAppStore();
  return (
    <GeneralSettings theme={theme} onThemeChange={(m) => void setTheme(m)} />
  );
}

export default function App() {
  const { hydrated } = useSettings();
  const platform = usePlatform();
  // Applied at the app root — not only in the settings route — so the
  // correct theme is on <html> from the first paint after mount.
  useTheme();
  const {
    activeChatId,
    setActiveChatId,
    pinnedChatIds,
    togglePinned,
    sidebarHidden,
  } = useAppStore();
  const { chats, createChat, deleteChat, renameChat } = useChatList();
  const rpc = useRpc();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultRow[] | null>(
    null,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openSearchResultRef = useRef<((r: SearchResultRow) => void) | null>(
    null,
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- debounced search */
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const timer = setTimeout(() => {
      void rpc.messages
        .search({ query: searchQuery })
        .then((r) => setSearchResults(r));
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, rpc]);

  const handleCreateChat = useCallback(async () => {
    const id = await createChat();
    navigate(`/chat/${id}`);
    focusComposer();
  }, [createChat, navigate]);

  useEffect(() => {
    void useTodoStore.getState().loadTodos();
    void useTodoStore.getState().hydrateSidebar();
    void usePomodoroStore.getState().hydrate();
    subscribeTodoChanges();
    subscribePomodoro();
    subscribeToolApprovals();
    subscribeUserInput();
    // Live chat list from other clients (mobile sends, assistant tool calls).
    subscribeChatSync();
    // Refocus heal: broadcasts missed while the desktop window slept are
    // refetched when it becomes visible again (mobile has the equivalent).
    const off = platform.onAppForeground?.(() => {
      useAppStore.getState().bumpChatsVersion();
    });
    return () => {
      off?.();
    };
  }, [platform]);

  useNotifications();

  useKeyboardShortcuts({
    handleCreateChat,
    navigate,
    paletteOpen,
    setPaletteOpen,
  });

  const handleDeleteChat = useCallback(
    async (id: number) => {
      await deleteChat(id);
      // Deleting the chat on screen must leave the screen: the newest
      // remaining chat, or the welcome state when none are left.
      if (id === activeChatId) navigate("/", { replace: true });
    },
    [deleteChat, activeChatId, navigate],
  );

  const handleSelectChat = useCallback(
    (id: number) => {
      setActiveChatId(id);
      navigate(`/chat/${id}`);
    },
    [navigate, setActiveChatId],
  );

  const handleRenameChat = useCallback(
    (id: number, title: string) => {
      void renameChat(id, title);
    },
    [renameChat],
  );

  const handleOpenSearchResult = useCallback(
    (r: SearchResultRow) => {
      setActiveChatId(r.chat_id);
      navigate(`/chat/${r.chat_id}`);
      openSearchResultRef.current?.(r);
    },
    [navigate, setActiveChatId],
  );

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-text-muted">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-bg text-text overflow-hidden">
        {!sidebarHidden && (
          <Sidebar
            chats={chats}
            activeChatId={activeChatId}
            searchQuery={searchQuery}
            searchResults={searchResults}
            pinnedChatIds={pinnedChatIds}
            onCreateChat={handleCreateChat}
            onSelectChat={handleSelectChat}
            onDeleteChat={(id) => void handleDeleteChat(id)}
            onRenameChat={handleRenameChat}
            onSearchChange={setSearchQuery}
            onOpenSearchResult={handleOpenSearchResult}
            onTogglePinned={(id) => void togglePinned(id)}
            onOpenSettings={() => navigate("/settings")}
            onOpenAnalytics={() => navigate("/analytics")}
          />
        )}
        <Routes>
          <Route path="/" element={<IndexRoute />} />
          <Route path="/chat/:chatId" element={<ChatRoute />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<GeneralRoute />} />
            <Route path="tools" element={<ToolsSettings />} />
            <Route path="mcp" element={<McpSettings />} />
            <Route path="skills" element={<SkillsSettings />} />
            <Route path="memory" element={<MemorySettings />} />
            <Route path="pomodoro" element={<PomodoroSettings />} />
            <Route path="voice" element={<VoiceSettings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TodoSidebar />
        <ApprovalPrompt />
        {paletteOpen && (
          <CommandPalette
            chats={chats}
            onSelectChat={handleSelectChat}
            onCreateChat={handleCreateChat}
            onClose={() => setPaletteOpen(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
