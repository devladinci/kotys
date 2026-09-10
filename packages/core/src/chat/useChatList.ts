import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelListing } from "@kotys/contracts";
import { useAppStore } from "../shared/useAppStore.js";
import { getRpc } from "../shared/clients.js";
import { rowToChat, type Chat } from "../shared/modelListing.js";

export type { Chat };

export function useChatList() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { activeChatId, setActiveChatId, defaultModel, chatsVersion } =
    useAppStore();
  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const loadChats = useCallback(async () => {
    try {
      const rows = await getRpc().chats.list();
      const parsed = rows.map(rowToChat);
      setChats(parsed);
      setLoaded(true);
      // chatSync reads this to detect stream frames naming a chat the list
      // has never seen (a lost chats:changed, or a chat created elsewhere).
      useAppStore.setState({
        knownChatIds: new Set(parsed.map((c) => c.id)),
      });
      if (parsed.length > 0 && activeChatIdRef.current === null) {
        setActiveChatId(parsed[0].id);
      }
    } catch {
      // Transient RPC failure: keep the previous list; the next
      // chatsVersion bump (event or reconnect) retries.
      setLoaded(true);
    }
  }, [setActiveChatId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- chatsVersion-driven reload */
    void loadChats();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadChats, chatsVersion]);

  const createChat = useCallback(async () => {
    const id = await getRpc().chats.create({
      title: "New chat",
      model: defaultModel,
    });
    await loadChats();
    setActiveChatId(Number(id));
    return Number(id);
  }, [defaultModel, loadChats, setActiveChatId]);

  const deleteChat = useCallback(
    async (id: number) => {
      await getRpc().chats.remove({ id });
      await loadChats();
      if (activeChatId === id) {
        setActiveChatId(null);
      }
    },
    [activeChatId, loadChats, setActiveChatId],
  );

  const renameChat = useCallback(
    async (id: number, title: string) => {
      await getRpc().chats.rename({ id, title });
      await loadChats();
    },
    [loadChats],
  );

  const selectModelForActiveChat = useCallback(
    async (model: ModelListing) => {
      if (activeChatId === null) return;
      await getRpc().chats.setModel({ id: activeChatId, model });
      await loadChats();
    },
    [activeChatId, loadChats],
  );

  return {
    chats,
    loaded,
    loadChats,
    createChat,
    deleteChat,
    renameChat,
    selectModelForActiveChat,
  };
}
