import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  subscribeChatSync,
  subscribePomodoro,
  subscribeTodoChanges,
  subscribeToolApprovals,
  subscribeUserInput,
  useAppStore,
  useChatList,
  usePlatform,
  usePomodoroStore,
  useRpc,
  useSettings,
  useTodoStore,
} from "@kotys/core";
import type { SearchResultRow } from "@kotys/contracts";
import { useTheme } from "./hooks/useTheme";
import { useNotifications } from "./hooks/useNotifications";
import {
  useKeyboardShortcuts,
  focusComposer,
} from "./hooks/useKeyboardShortcuts";
import ErrorBoundary from "./components/ErrorBoundary";
import Sidebar from "./components/chat/Sidebar";
import ApprovalPrompt from "./components/chat/ApprovalPrompt";
import CommandPalette from "./components/chat/CommandPalette";
import TodoSidebar from "./components/todos/TodoSidebar";
import { SettingsLayout } from "./components/settings/SettingsLayout";
import AnalyticsPage from "./components/analytics";
import { ToolsSettings } from "./components/settings/ToolsSettings";
import McpSettings from "./components/settings/McpSettings";
import SkillsSettings from "./components/settings/SkillsSettings";
import MemorySettings from "./components/settings/MemorySettings";
import PomodoroSettings from "./components/settings/PomodoroSettings";
import VoiceSettings from "./components/settings/VoiceSettings";
import { ChatRoute } from "./routes/ChatRoute";
import { GeneralRoute } from "./routes/GeneralRoute";
import { IndexRoute } from "./routes/IndexRoute";

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

  const handleDeleteChatClick = (id: number) => void handleDeleteChat(id);

  const handleTogglePinned = (id: number) => void togglePinned(id);

  const handleOpenSettings = () => navigate("/settings");

  const handleOpenAnalytics = () => navigate("/analytics");

  const handleClosePalette = () => setPaletteOpen(false);

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
            onDeleteChat={handleDeleteChatClick}
            onRenameChat={handleRenameChat}
            onSearchChange={setSearchQuery}
            onOpenSearchResult={handleOpenSearchResult}
            onTogglePinned={handleTogglePinned}
            onOpenSettings={handleOpenSettings}
            onOpenAnalytics={handleOpenAnalytics}
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
            onClose={handleClosePalette}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
