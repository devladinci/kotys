import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import type { ChatStreamResult, ModelListing } from "@kotys/contracts";
import { ERROR_TURN_PREFIX } from "@kotys/contracts";
import { hostFor, useAppStore } from "../shared/useAppStore.js";
import { getRpc } from "../shared/clients.js";
import { parseSlashCommand } from "../skills/slashCommand.js";
import { SkillMessage } from "../skills/SkillMessage.js";
import { projectedUsedTokens } from "./useTokenEstimator.js";
import type { ToolDelta } from "./streamThrottle.js";
import { StreamCollector, mergeChunks, mergeTools } from "./streamThrottle.js";
import { clearStreamActivity, declareStreamActivity } from "./echoGuard.js";
import {
  candidateLiveStream,
  chatIdFor,
  claimLiveStream,
  releaseLiveStream,
} from "./liveStreams.js";
import {
  finishStreamEntry,
  getStreamingId,
  isChatBusy,
  isStreaming,
  startStreamEntry,
  subscribeStreaming,
} from "./streamState.js";
import { useMessages } from "./useMessages.js";
import { applyChunk, applyDone, applyToolActivity } from "./streamFrames.js";
import { useChatActions } from "./useChatActions.js";
import { useChatStream } from "./useChatStream.js";
import { useStreamAdoption } from "./useStreamAdoption.js";
import { useMessageQueue } from "./useMessageQueue.js";
import type { Message } from "./types.js";

interface UseChatArgs {
  activeChatId: number | null;
  chatSummary: string | null;
  chatSummaryUpto: number | null;
  chatModel: ModelListing;
  chatTitle: string;
  chatTopics: string[];
  onChatCreated?: (id: number) => void;
  onTopicsInferred?: (id: number) => void;
  onTitleInferred?: (id: number) => void;
  onSummaryChanged?: () => void;
}

/** UI cadence for streamed chunk flushes (~11 fps). */
const STREAM_FLUSH_MS = 90;

export type { QueuedMessage } from "./useMessageQueue.js";

export function useChat(args: UseChatArgs) {
  const {
    activeChatId,
    chatSummary,
    chatSummaryUpto,
    chatModel,
    chatTitle,
    chatTopics,
    onChatCreated,
    onTopicsInferred,
    onTitleInferred,
    onSummaryChanged,
  } = args;

  const { apiKeyPresent } = useAppStore();
  const thinkingEffort = useAppStore((s) => s.thinkingEffort);
  const permissionMode = useAppStore((s) => s.permissionMode);
  const rpc = getRpc();

  const busy = useSyncExternalStore(
    subscribeStreaming,
    () => activeChatId !== null && isChatBusy(activeChatId),
    () => activeChatId !== null && isChatBusy(activeChatId),
  );
  // Sentinel -1 = busy before the assistant row exists; UI shows pending, not stop.
  const rawStreamingId = useSyncExternalStore(
    subscribeStreaming,
    () => (activeChatId === null ? null : getStreamingId(activeChatId)),
    () => (activeChatId === null ? null : getStreamingId(activeChatId)),
  );
  const streamingId = rawStreamingId === -1 ? null : rawStreamingId;
  const isLoading = busy;
  const [isCompacting, setIsCompacting] = useState(false);
  const { queuedMessages, enqueue, dequeue, drain } =
    useMessageQueue(activeChatId);

  const streamBuffersRef = useRef<
    Map<number, { content: string; thinking: string }>
  >(new Map());
  const toolBuffersRef = useRef<Map<number, Message["toolCalls"]>>(new Map());
  // Inference needs the final stream content, so it's consumed on done.
  const pendingInferenceRef = useRef<
    Map<
      number,
      {
        chatId: number;
        userText: string;
        model: ModelListing;
        needsTopics: boolean;
        isFreshChat: boolean;
      }
    >
  >(new Map());
  const mountedRef = useRef(true);

  const {
    messages,
    setMessages,
    insertMessage,
    updateMessage,
    openSearchResult,
    highlightId,
    refresh: refreshMessages,
  } = useMessages(activeChatId);

  const { inferTopics, inferTitle } = useChatActions();

  // Collectors (see streamThrottle) flush to state on a cadence.
  const collectorRef = useRef(
    new StreamCollector<number, { content: string; thinking: string }>(
      STREAM_FLUSH_MS,
      mergeChunks,
      (snapshot) => {
        setMessages((prev) => {
          let next: Message[] | null = null;
          for (const [requestId, d] of snapshot) {
            const idx = prev.findIndex((m) => m.id === requestId);
            if (idx === -1) continue;
            const m = prev[idx];
            next ??= [...prev];
            next[idx] = {
              ...m,
              thinking: (m.thinking ?? "") + d.thinking,
              content: m.content + d.content,
            };
          }
          return next ?? prev;
        });
      },
    ),
  );
  const toolCollectorRef = useRef(
    new StreamCollector<number, ToolDelta[]>(
      STREAM_FLUSH_MS,
      mergeTools,
      (snapshot) => {
        setMessages((prev) => {
          let next: Message[] | null = null;
          for (const [requestId, activities] of snapshot) {
            if (!prev.some((m) => m.id === requestId)) continue;
            next ??= [...prev];
            next = next.map((m) => {
              if (m.id !== requestId) return m;
              const toolCalls = [...(m.toolCalls ?? [])];
              for (const [index, activity] of activities) {
                while (toolCalls.length < index)
                  toolCalls.push(undefined as never);
                toolCalls[index] = activity;
              }
              return { ...m, toolCalls: toolCalls.filter(Boolean) };
            });
          }
          return next ?? prev;
        });
      },
    ),
  );

  const {
    stream,
    abort: abortStream,
    appendStream,
  } = useChatStream(
    {
      onOwnChunk: (requestId, thinkingDelta, contentDelta) => {
        const buf = streamBuffersRef.current.get(requestId) ?? {
          content: "",
          thinking: "",
        };
        buf.content += contentDelta;
        buf.thinking += thinkingDelta;
        streamBuffersRef.current.set(requestId, buf);
        collectorRef.current.add(requestId, {
          content: contentDelta,
          thinking: thinkingDelta,
        });
      },
      onOwnToolActivity: (requestId, index, activity) => {
        const list = toolBuffersRef.current.get(requestId) ?? [];
        while (list.length < index) list.push(undefined as never);
        list[index] = activity;
        toolBuffersRef.current.set(requestId, list);
        toolCollectorRef.current.add(requestId, [[index, activity]]);
      },
      onOwnDone: (requestId, result) => {
        collectorRef.current.flushNow(); // tail deltas pending on the cadence timer
        toolCollectorRef.current.flushNow();
        finaliseStream(requestId, result);
        const pending = pendingInferenceRef.current.get(requestId);
        if (pending) {
          pendingInferenceRef.current.delete(requestId);
          const finalText = result.content || "";
          if (finalText) {
            if (pending.needsTopics) {
              void inferTopics(
                pending.chatId,
                pending.userText,
                pending.model,
                onTopicsInferred,
              );
            }
            if (pending.isFreshChat) {
              void inferTitle(
                pending.chatId,
                pending.userText,
                pending.model,
                onTitleInferred,
                finalText,
              );
            }
          }
        }
      },
      onOwnError: (requestId, error) => {
        collectorRef.current.flushNow();
        toolCollectorRef.current.flushNow();
        finaliseError(requestId, error);
        pendingInferenceRef.current.delete(requestId);
      },
      // Another client is streaming into the chat we have open. Live deltas
      // keep the ChatGPT-style smoothness; the server's 1s progress pulse
      // persists the row meanwhile, and a pull on done/error/error-path is
      // the healing snap (streamer output is append-only, so a snapshot can
      // only move the view forward — no duplication, no regressions).
      onForeignChunk: (requestId, thinkingDelta, contentDelta) => {
        setMessages((prev) =>
          applyChunk(prev, requestId, thinkingDelta, contentDelta),
        );
      },
      onForeignToolActivity: (requestId, index, activity) => {
        setMessages((prev) =>
          applyToolActivity(prev, requestId, index, activity),
        );
      },
      onForeignDone: (requestId, result) => {
        setMessages((prev) => applyDone(prev, requestId, result));
      },
      onForeignError: () => {
        // The server persisted the error into the message; pull it in.
        refreshMessages();
      },
    },
    activeChatId,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A remounted chat view lost its component-local streaming state; the
  // daemon may still be streaming into this chat. Re-adopt the live stream
  // (button back to "stop"), or clear a stale registry claim.
  useStreamAdoption(activeChatId, {
    adopt: (requestId) => {
      if (activeChatId === null) return;
      startStreamEntry(activeChatId, requestId);
      declareStreamActivity(activeChatId);
    },
    onGone: (requestId) => {
      if (activeChatId === null) return;
      releaseLiveStream(requestId);
      finishStreamEntry(activeChatId);
      clearStreamActivity(activeChatId);
      refreshMessages();
    },
  });

  // Pending cadence timer must not fire into a dead component.
  useEffect(() => {
    const collector = collectorRef.current;
    const toolCollector = toolCollectorRef.current;
    return () => {
      collector.dispose();
      toolCollector.dispose();
    };
  }, []);

  const finaliseStream = useCallback(
    async (assistantId: number, result: ChatStreamResult) => {
      const finalContent = result.content || "_(stopped)_";
      await updateMessage(assistantId, {
        content: finalContent,
        ...(result.thinking ? { thinking: result.thinking } : {}),
        ...(result.promptTokens ? { promptTokens: result.promptTokens } : {}),
        ...(result.evalTokens ? { evalTokens: result.evalTokens } : {}),
        ...(result.tokensMeasured !== undefined
          ? { tokensMeasured: result.tokensMeasured }
          : {}),
        ...(result.toolCalls.length > 0
          ? { toolCalls: JSON.stringify(result.toolCalls) }
          : {}),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: finalContent,
                thinking: result.thinking,
                model: chatModel.name,
                promptTokens: result.promptTokens || undefined,
                evalTokens: result.evalTokens || undefined,
                tokensMeasured: result.tokensMeasured || undefined,
                toolCalls:
                  result.toolCalls.length > 0 ? result.toolCalls : undefined,
              }
            : m,
        ),
      );
      streamBuffersRef.current.delete(assistantId);
      toolBuffersRef.current.delete(assistantId);
      // Resolve the finishing chat from the claim before releasing it — a
      // background chat's done must clear its own entry, not the open chat's.
      const doneChatId = chatIdFor(assistantId) ?? activeChatId;
      releaseLiveStream(assistantId);
      if (doneChatId !== null) {
        finishStreamEntry(doneChatId);
        clearStreamActivity(doneChatId);
      }
      return { finalContent, result };
    },
    [activeChatId, chatModel.name, setMessages, updateMessage],
  );

  const finaliseError = useCallback(
    async (assistantId: number, errorMsg: string) => {
      const buf = streamBuffersRef.current.get(assistantId);
      const tools = toolBuffersRef.current.get(assistantId)?.filter(Boolean);
      const errorContent = `${buf?.content ? buf.content + "\n\n" : ""}${ERROR_TURN_PREFIX} ${errorMsg}`;
      await updateMessage(assistantId, {
        content: errorContent,
        ...(buf?.thinking ? { thinking: buf.thinking } : {}),
        ...(tools && tools.length > 0
          ? { toolCalls: JSON.stringify(tools) }
          : {}),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: errorContent,
                thinking: buf?.thinking || undefined,
              }
            : m,
        ),
      );
      streamBuffersRef.current.delete(assistantId);
      toolBuffersRef.current.delete(assistantId);
      const doneChatId = chatIdFor(assistantId) ?? activeChatId;
      releaseLiveStream(assistantId);
      if (doneChatId !== null) {
        finishStreamEntry(doneChatId);
        clearStreamActivity(doneChatId);
      }
    },
    [activeChatId, setMessages, updateMessage],
  );

  const send = useCallback(
    async (
      text: string,
      images: string[],
      opts?: { skipTitleInference?: boolean },
    ) => {
      if (!text.trim() && images.length === 0)
        return { needsSettings: false as const };

      // Presence, not value: the key never leaves the daemon (write-only RPC).
      // Checked before enqueue so queued messages can never be lost to a
      // missing key at drain time.
      if (!apiKeyPresent && chatModel.source !== "local") {
        return { needsSettings: true as const };
      }

      // A leading /command resolves to the skill body and is persisted that
      // way, so the instructions survive context rebuilds on later turns.
      let content = text;
      const slash = parseSlashCommand(text);
      if (slash) {
        const rpc = getRpc();
        try {
          const detail = await rpc.skills.get({ name: slash.name });
          if (detail) {
            content = SkillMessage.build(slash.name, slash.args, detail.body);
          } else if (slash.args === "") {
            // Unknown bare /command: leave as typed; the model sees it and
            // can say the skill does not exist.
            content = text;
          }
        } catch {
          content = text;
        }
      }

      if (
        activeChatId !== null &&
        (isChatBusy(activeChatId) || candidateLiveStream(activeChatId) !== null)
      ) {
        enqueue(content, images);
        return { needsSettings: false as const };
      }
      // Claimed before the first await: the drain effect must not re-fire
      // while this send awaits its RPCs. -1 = busy before the assistant row.
      if (activeChatId !== null) startStreamEntry(activeChatId, -1);

      let currentChatId = activeChatId;
      if (!currentChatId) {
        const newId = await rpc.chats.create({
          title: "New chat",
          model: chatModel,
        });
        currentChatId = Number(newId);
        onChatCreated?.(currentChatId);
      }

      if (!currentChatId) return { needsSettings: false as const };

      const userMessageId = await insertMessage(
        currentChatId,
        "user",
        content,
        images.length > 0 ? images : undefined,
      );
      if (userMessageId === null) return { needsSettings: false as const };

      const userMessage: Message = {
        id: userMessageId,
        role: "user",
        content,
        images: images.length > 0 ? images : undefined,
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      // Own RPC writes echo back as broadcasts until finalise — see echoGuard.
      declareStreamActivity(currentChatId);

      const isFreshChat = chatTitle === "New chat" && !opts?.skipTitleInference;
      if (isFreshChat) {
        void inferTitle(currentChatId, text, chatModel, onTitleInferred);
      }
      const needsTopics = chatTopics.length === 0;

      let assistantMessageId: number | null = null;
      try {
        const newAssistantId = await insertMessage(
          currentChatId,
          "assistant",
          "",
        );
        if (newAssistantId === null) {
          clearStreamActivity(currentChatId);
          finishStreamEntry(currentChatId);
          return { needsSettings: false as const };
        }
        assistantMessageId = newAssistantId;
        setMessages((prev) => [
          ...prev,
          {
            id: newAssistantId,
            role: "assistant",
            content: "",
            thinking: "",
            model: chatModel.name,
          },
        ]);
        startStreamEntry(currentChatId, newAssistantId);
        claimLiveStream(newAssistantId, currentChatId);

        // Registered before stream() so an instant done/error finds it.
        pendingInferenceRef.current.set(newAssistantId, {
          chatId: currentChatId,
          userText: SkillMessage.fromContent(content)?.args || text,
          model: chatModel,
          needsTopics,
          isFreshChat,
        });

        stream(
          newAssistantId,
          chatModel,
          hostFor(chatModel),
          updatedMessages,
          thinkingEffort,
          permissionMode,
          currentChatId,
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        clearStreamActivity(currentChatId);
        finishStreamEntry(currentChatId);
        if (assistantMessageId !== null) {
          await finaliseError(assistantMessageId, errorMsg);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              role: "assistant",
              content: `${ERROR_TURN_PREFIX} ${errorMsg}`,
              model: chatModel.name,
            },
          ]);
        }
      }
      return { needsSettings: false as const };
    },
    [
      activeChatId,
      apiKeyPresent,
      chatModel,
      chatTitle,
      chatTopics,
      finaliseError,
      insertMessage,
      inferTitle,
      messages,
      onChatCreated,
      onTitleInferred,
      permissionMode,
      rpc,
      setMessages,
      stream,
      thinkingEffort,
      enqueue,
    ],
  );

  // Drain the queue: one message per idle transition, FIFO.
  useEffect(() => {
    if (activeChatId === null) return;
    if (isChatBusy(activeChatId) || isStreaming(activeChatId)) return;
    if (queuedMessages.length === 0) return;
    const [next, ...rest] = queuedMessages;
    drain(next, rest);
    // setState inside an effect trips react-hooks/set-state-in-effect; defer
    // past the synchronous effect body. cancelled guards chat-switch unmounts.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled)
        void send(next.text, next.images, { skipTitleInference: true });
    });
    return () => {
      cancelled = true;
    };
  }, [activeChatId, busy, streamingId, queuedMessages, send, drain]);

  const abort = useCallback(() => {
    if (streamingId === null || activeChatId === null) return;
    abortStream(streamingId);
    releaseLiveStream(streamingId);
    clearStreamActivity(activeChatId);
    finishStreamEntry(activeChatId);
  }, [activeChatId, streamingId, abortStream]);

  // Steering: inject a queued message into the running turn at the next
  // tool-round boundary. Persistence-first — the row is written before the
  // append is sent, so even if the turn ends before consuming it, the text
  // is already in history and reaches the model next turn. No double-send:
  // the queue entry is removed here, and the drain effect never sees it.
  const steer = useCallback(
    async (queuedId: number) => {
      if (activeChatId === null) return;
      // No live turn (streamingId is null while idle, -1 while the assistant
      // row is still pending): leave it queued — the idle drain sends it.
      if (streamingId === null) return;
      const item = queuedMessages.find((q) => q.id === queuedId);
      if (!item) return;
      const userMessageId = await insertMessage(
        activeChatId,
        "user",
        item.text,
        item.images && item.images.length > 0 ? item.images : undefined,
      );
      if (userMessageId === null) return;
      // Echo guard suppresses refetches while the turn streams, so the
      // bubble is added to local state directly; other viewers get it via
      // the messages:changed broadcast.
      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user",
          content: item.text,
          images:
            item.images && item.images.length > 0 ? item.images : undefined,
        },
      ]);
      // Images are persisted with the row but not injected live — the
      // append frame carries text only; the model sees them next turn.
      appendStream(streamingId, item.text);
      dequeue(queuedId);
    },
    [
      activeChatId,
      streamingId,
      queuedMessages,
      insertMessage,
      setMessages,
      appendStream,
      dequeue,
    ],
  );

  // A manual compact and the pre-send auto-compact must not race summary RPCs.
  const compactNow = useCallback(async (): Promise<
    "compacted" | "nothing" | "error"
  > => {
    if (activeChatId === null || isCompacting) return "nothing";
    setIsCompacting(true);
    try {
      const res = await rpc.chats.compact({ id: activeChatId, force: true });
      if ("summary" in res) onSummaryChanged?.();
      return "summary" in res ? "compacted" : "nothing";
    } catch {
      return "error";
    } finally {
      setIsCompacting(false);
    }
  }, [activeChatId, isCompacting, onSummaryChanged, rpc]);

  const regenerate = useCallback(
    async (assistantId: number) => {
      if (activeChatId === null || isLoading) return;
      if (!apiKeyPresent && chatModel.source !== "local") return;
      const idx = messages.findIndex((m) => m.id === assistantId);
      if (idx === -1 || messages[idx].role !== "assistant") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: "",
                thinking: "",
                model: chatModel.name,
                toolCalls: undefined,
                promptTokens: undefined,
                evalTokens: undefined,
              }
            : m,
        ),
      );
      // Wipe the DB row before replaying. A failed turn's persisted
      // error-marker text would otherwise be rebuilt as history on the
      // next request and shown to the model as its own prior reply — and a
      // second failure would stack another error onto it. Old tool results
      // must go too: their replay budget could crowd out the fresh turn.
      await rpc.messages.resetForRetry({ id: assistantId });
      startStreamEntry(activeChatId, assistantId);
      claimLiveStream(assistantId, activeChatId);
      declareStreamActivity(activeChatId);
      stream(
        assistantId,
        chatModel,
        hostFor(chatModel),
        [],
        thinkingEffort,
        permissionMode,
        activeChatId,
      );
    },
    [
      activeChatId,
      apiKeyPresent,
      chatModel,
      isLoading,
      messages,
      permissionMode,
      rpc,
      setMessages,
      stream,
      thinkingEffort,
    ],
  );

  const editAndResend = useCallback(
    async (userMessageId: number, newText: string, newImages?: string[]) => {
      if (activeChatId === null || isLoading) return;
      if (!newText.trim() && (newImages?.length ?? 0) === 0) return;
      if (!apiKeyPresent && chatModel.source !== "local") return;
      const idx = messages.findIndex((m) => m.id === userMessageId);
      if (idx === -1 || messages[idx].role !== "user") return;
      const trimmed = messages.slice(0, idx + 1);
      await updateMessage(userMessageId, {
        content: newText,
      });
      const updatedUser: Message = {
        ...messages[idx],
        content: newText,
        images: newImages && newImages.length > 0 ? newImages : undefined,
      };
      const updatedMessages = [...trimmed.slice(0, idx), updatedUser];
      setMessages(updatedMessages);
      const newAssistantId = await insertMessage(activeChatId, "assistant", "");
      if (newAssistantId === null) return;
      setMessages((prev) => [
        ...prev,
        {
          id: newAssistantId,
          role: "assistant",
          content: "",
          thinking: "",
          model: chatModel.name,
        },
      ]);
      startStreamEntry(activeChatId, newAssistantId);
      claimLiveStream(newAssistantId, activeChatId);
      declareStreamActivity(activeChatId);
      stream(
        newAssistantId,
        chatModel,
        hostFor(chatModel),
        updatedMessages,
        thinkingEffort,
        permissionMode,
        activeChatId,
        { historyUpto: userMessageId },
      );
    },
    [
      activeChatId,
      apiKeyPresent,
      chatModel,
      isLoading,
      messages,
      insertMessage,
      setMessages,
      stream,
      thinkingEffort,
      permissionMode,
      updateMessage,
    ],
  );

  const contextUsed = useMemo(
    () =>
      projectedUsedTokens(messages, {
        summary: chatSummary,
        summaryUpto: chatSummaryUpto,
      }),
    [messages, chatSummary, chatSummaryUpto],
  );

  return {
    messages,
    isLoading,
    streamingId,
    highlightId,
    send,
    abort,
    openSearchResult,
    contextUsed,
    compactNow,
    isCompacting,
    regenerate,
    editAndResend,
    queuedMessages,
    dequeue,
    steer,
  };
}
