import { getSocket } from "../shared/clients.js";
import { useAppStore } from "../shared/useAppStore.js";
import { debounceSync } from "./useMessages.js";
import { markGenerating, markGeneratingDone } from "./generating.js";

let subscribed = false;

/**
 * Cross-client chat-list sync: bumps chatsVersion whenever the daemon
 * broadcasts a `chats:changed`, so every useChatList consumer refetches.
 * Message-level sync is per-view in useMessages.
 */
export function subscribeChatSync(): void {
  if (subscribed) return;
  subscribed = true;
  // One exchange emits several change events; the debounce coalesces them.
  const bump = debounceSync(() => {
    useAppStore.getState().bumpChatsVersion();
  }, 250);
  getSocket().on((msg) => {
    if (msg.type === "chats:changed") bump();
    // Sync heal: a stream frame proves the chat exists on the daemon even if
    // no chats:changed ever reached us (lost while disconnected, or this
    // client opened before the chat was created). Frames carry the chatId;
    // refetching the list reconciles it in.
    if (
      (msg.type === "chat:chunk" ||
        msg.type === "chat:tool" ||
        msg.type === "chat:done" ||
        msg.type === "chat:error") &&
      "chatId" in msg &&
      typeof msg.chatId === "number" &&
      !useAppStore.getState().knownChatIds.has(msg.chatId)
    ) {
      bump();
    }
    // Generating indicator: the daemon pulses `messages:progress` every second
    // per live stream, so heartbeats cover streams started on any client,
    // including through long silent tool calls. done/error end the pulse and
    // clear instantly; a lost heartbeat ages the entry out (generating TTL).
    if (msg.type === "messages:progress") {
      markGenerating(msg.payload.chatId, Date.now());
    }
    if (msg.type === "chat:done" || msg.type === "chat:error") {
      if (typeof msg.chatId === "number") markGeneratingDone(msg.chatId);
    }
  });
  // Broadcasts emitted while disconnected are lost; refetch the list when the
  // connection comes back (phone unlock, network blip).
  getSocket().onStatus((status) => {
    if (status === "connected") bump();
  });
}
