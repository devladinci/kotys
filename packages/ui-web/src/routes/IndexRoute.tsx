import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore, useChatList } from "@kotys/core";
import ChatView from "../components/chat/ChatView";

const selectNothing = async (): Promise<void> => undefined;

export function IndexRoute() {
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

  const handleCreateChat = () => void createChat();

  const handleChatCreated = (newId: number) => {
    setActiveChatId(newId);
    navigate(`/chat/${newId}`);
  };

  return (
    <ChatView
      activeChat={undefined}
      activeChatId={null}
      defaultModel={defaultModel}
      onCreateChat={handleCreateChat}
      onChatCreated={handleChatCreated}
      onSelectModel={selectNothing}
    />
  );
}
