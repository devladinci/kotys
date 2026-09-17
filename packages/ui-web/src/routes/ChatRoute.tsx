import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore, useChatList } from "@kotys/core";
import type { SearchResultRow } from "@kotys/contracts";
import ChatView from "../components/chat/ChatView";
import { focusComposer } from "../hooks/useKeyboardShortcuts";

type ChatRouteParams = { chatId: string };

export function ChatRoute() {
  const { chatId } = useParams<ChatRouteParams>();
  const id = chatId ? Number(chatId) : null;
  const {
    setActiveChatId,
    activeChatId,
    sidebarHidden,
    setSidebarHidden,
    defaultModel,
    bumpChatsVersion,
  } = useAppStore();
  const { chats, loaded, createChat, selectModelForActiveChat } = useChatList();
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

  const createAndOpenChat = useCallback(async () => {
    const newId = await createChat();
    navigate(`/chat/${newId}`);
    focusComposer();
  }, [createChat, navigate]);

  const activeChat = useMemo(() => chats.find((c) => c.id === id), [chats, id]);

  const handleToggleSidebar = () => setSidebarHidden(!sidebarHidden);

  const handleCreateChat = () => void createAndOpenChat();

  return (
    <ChatView
      activeChat={activeChat}
      activeChatId={id}
      defaultModel={defaultModel}
      sidebarHidden={sidebarHidden}
      onToggleSidebar={handleToggleSidebar}
      onCreateChat={handleCreateChat}
      onChatCreated={setActiveChatId}
      onTopicsInferred={bumpChatsVersion}
      onTitleInferred={bumpChatsVersion}
      onSummaryChanged={bumpChatsVersion}
      onSelectModel={selectModelForActiveChat}
      openSearchResultRef={openSearchResultRef}
    />
  );
}
