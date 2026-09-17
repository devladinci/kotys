import { getSocket } from "../shared/clients.js";
import { useAppStore } from "../shared/useAppStore.js";
import { debounceSync } from "./useMessages.js";
import { markGenerating, markGeneratingDone } from "./generating.js";
import { hasLiveStream } from "./liveStreams.js";
import {
  finishStreamEntry,
  getStreamingId,
  startStreamEntry,
} from "./streamState.js";

let subscribed = false;

/**
 * Cross-client chat-list sync: bumps chatsVersion whenever the daemon
 * broadcasts a `chats:changed`, so every useChatList consumer refetches.
 * Message-level sync is per-view in useMessages.
 *
 * Stream frames also carry the busy state across devices: a client that only
 * watches a stream another device started never claims it, so its chunk/tool
 * frames mark the chat streaming here too. Frames of a stream this client
 * owns are left alone — the owner path in useChat keeps its state.
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
    if (msg.type === "messages:progress") {
      markGenerating(msg.payload.chatId, Date.now());
      // Pulses also carry the busy state: a viewer that reconnects mid-stream
      // (frames before its socket returned are gone) is healed within a tick.
      markForeignBusy(msg.payload.chatId, msg.payload.messageId);
    }
    if (msg.type === "chat:done" || msg.type === "chat:error") {
      if (typeof msg.chatId === "number") markGeneratingDone(msg.chatId);
      clearForeignBusy(msg.chatId, msg.payload.requestId);
    }
    if (msg.type === "chat:chunk" || msg.type === "chat:tool") {
      markForeignBusy(msg.chatId, msg.payload.requestId);
    }
  });
  // Broadcasts emitted while disconnected are lost; refetch the list when the
  // connection comes back (phone unlock, network blip).
  getSocket().onStatus((status) => {
    if (status === "connected") bump();
  });
}

// A stream this client claimed is the owner's to manage: the owner path in
// useChat keeps its state, and the entry already matches this request.
function markForeignBusy(chatId: number | undefined, requestId: number): void {
  if (typeof chatId !== "number") return;
  if (hasLiveStream(requestId)) return;
  if (getStreamingId(chatId) === requestId) return;
  startStreamEntry(chatId, requestId);
}

function clearForeignBusy(chatId: number | undefined, requestId: number): void {
  if (typeof chatId !== "number") return;
  if (hasLiveStream(requestId)) return;
  if (getStreamingId(chatId) !== requestId) return;
  finishStreamEntry(chatId);
}
