import { getRpc, getSocket } from "../shared/clients.js";
import { useAppStore } from "../shared/useAppStore.js";
import { debounceSync } from "./useMessages.js";
import { markGenerating, markGeneratingDone } from "./generating.js";
import { hasLiveStream, wasStreamStopped } from "./liveStreams.js";
import {
  finishStreamEntry,
  getStreamingId,
  isStreaming,
  startStreamEntry,
} from "./streamState.js";

let subscribedSocket: unknown = null;

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
  const socket = getSocket();
  // The app root wires one listener per socket instance. Tests swap the
  // mocked socket per file, and setClients can be called again later in an
  // app's lifetime — both must be able to (re)subscribe.
  if (subscribedSocket === socket) return;
  subscribedSocket = socket;
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
      markForeignBusy(msg.payload.messageId, msg.payload.chatId);
    }
    if (msg.type === "chat:done" || msg.type === "chat:error") {
      if (typeof msg.chatId === "number") markGeneratingDone(msg.chatId);
      clearForeignBusy(msg.payload.requestId, msg.chatId);
    }
    if (msg.type === "chat:chunk" || msg.type === "chat:tool") {
      markForeignBusy(msg.payload.requestId, msg.chatId);
    }
  });
  // Broadcasts emitted while disconnected are lost; refetch the list when the
  // connection comes back (phone unlock, network blip). The same drop can eat
  // a chat's final chat:done, so viewer entries are re-confirmed then too.
  getSocket().onStatus((status) => {
    if (status !== "connected") return;
    bump();
    reconfirmForeignEntries();
  });
}

/**
 * A busy entry no frame backs anymore — its chat:done was lost to a socket
 * drop, or its chat never had one. Ask the daemon per chat: a live id keeps
 * the entry, null clears it, a failed probe keeps it (healed on the next
 * connect or by an adoption recheck). Streams this client owns are the
 * owner path's business.
 */
function reconfirmForeignEntries(): void {
  const { knownChatIds } = useAppStore.getState();
  for (const chatId of knownChatIds) {
    if (!isStreaming(chatId)) continue;
    // isStreaming guarantees the entry; getStreamingId narrows to non-null.
    const id = getStreamingId(chatId);
    if (id === null || id === -1 || hasLiveStream(id) || wasStreamStopped(id))
      continue;
    void forgetStaleEntriesIfAbsent(chatId, id);
  }
}

async function forgetStaleEntriesIfAbsent(
  chatId: number,
  requestId: number,
): Promise<void> {
  try {
    const live = await getRpc().chats.liveStream({ chatId });
    if (getStreamingId(chatId) !== requestId) return;
    if (live === requestId) return;
    finishStreamEntry(chatId);
  } catch {
    // Unreachable daemon proves nothing; the entry stands until the next heal.
  }
}

// A stream this client claimed or stopped is this client's business: the owner
// path in useChat keeps its state, and late frames of a stopped stream must
// not clobber the next turn's. An existing entry is never overwritten — the
// next turn's id was set by a queue drain that already fired.
function markForeignBusy(requestId: number, chatId?: number): void {
  if (typeof chatId !== "number") return;
  if (hasLiveStream(requestId) || wasStreamStopped(requestId)) return;
  if (isStreaming(chatId)) return;
  startStreamEntry(chatId, requestId);
}

function clearForeignBusy(requestId: number, chatId?: number): void {
  if (typeof chatId !== "number") return;
  if (hasLiveStream(requestId) || wasStreamStopped(requestId)) return;
  if (getStreamingId(chatId) !== requestId) return;
  finishStreamEntry(chatId);
}
