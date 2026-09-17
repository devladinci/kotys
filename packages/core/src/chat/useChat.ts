import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ChatStreamResult,
  ModelListing,
  ToolActivity,
} from "@kotys/contracts";
import { ERROR_TURN_PREFIX, isSteerActivity } from "@kotys/contracts";
import { hostFor, useAppStore } from "../shared/useAppStore.js";
import { getRpc } from "../shared/clients.js";
import { findSlashCommands } from "../skills/slashCommand.js";
import { SkillMessage } from "../skills/SkillMessage.js";
import { projectedUsedTokens } from "./useTokenEstimator.js";
import type { ChunkDeltas, ToolDelta } from "./streamThrottle.js";
import { StreamCollector, mergeChunks, mergeTools } from "./streamThrottle.js";
import { clearStreamActivity, declareStreamActivity } from "./echoGuard.js";
import {
  candidateLiveStream,
  chatIdFor,
  claimLiveStream,
  markStreamStopped,
  releaseLiveStream,
  forgetStreamStopped,
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
import { confirmSteer, getQueued, markSteering } from "./queueStore.js";
import { steerStateOf } from "./queuedSteer.js";
import type { Message } from "./types.js";

interface IProps {
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

interface IPendingInference {
  chatId: number;
  userText: string;
  model: ModelListing;
  needsTopics: boolean;
  isFreshChat: boolean;
}

interface ISendOptions {
  skipTitleInference?: boolean;
}

const STREAM_FLUSH_MS = 90;

export type { QueuedMessage } from "./useMessageQueue.js";

// Settled on arrival, not on the flush cadence, so the done frame right
// behind a receipt cannot find its entry still queued and send it twice.
function settleSteer(activity: ToolActivity): void {
  if (!isSteerActivity(activity) || !activity.widget.id) return;
  confirmSteer(activity.widget.id);
}

export function useChat({
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
}: IProps) {
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

  const streamBuffersRef = useRef<Map<number, ChunkDeltas>>(new Map());
  const toolBuffersRef = useRef<Map<number, Message["toolCalls"]>>(new Map());
  const pendingInferenceRef = useRef<Map<number, IPendingInference>>(new Map());

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

  const collectorRef = useRef(
    new StreamCollector<number, ChunkDeltas>(
      STREAM_FLUSH_MS,
      mergeChunks,
      (snapshot) => {
        setMessages((prev) => {
          let next: Message[] | null = null;
          for (const [requestId, d] of snapshot) {
            const idx = prev.findIndex((m) => m.id === requestId);
            if (idx === -1) continue;
            const m = prev[idx];
            if (next === null) next = [...prev];
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
            if (next === null) next = [...prev];
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
        settleSteer(activity);
        const list = toolBuffersRef.current.get(requestId) ?? [];
        while (list.length < index) list.push(undefined as never);
        list[index] = activity;
        toolBuffersRef.current.set(requestId, list);
        toolCollectorRef.current.add(requestId, [[index, activity]]);
      },
      onOwnDone: (requestId, result) => {
        // The trace also settles a receipt whose own frame was never replayed.
        result.toolCalls.forEach(settleSteer);
        // Flush before finalise, or a late timer flush re-appends the tail.
        collectorRef.current.flushNow();
        toolCollectorRef.current.flushNow();
        finaliseStream(requestId, result);
        const pending = pendingInferenceRef.current.get(requestId);
        if (!pending) return;
        pendingInferenceRef.current.delete(requestId);
        if (!result.content) return;
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
            result.content,
          );
        }
      },
      onOwnError: (requestId, error) => {
        collectorRef.current.flushNow();
        toolCollectorRef.current.flushNow();
        finaliseError(requestId, error);
        pendingInferenceRef.current.delete(requestId);
      },
      onForeignChunk: (requestId, thinkingDelta, contentDelta) => {
        setMessages((prev) =>
          applyChunk(prev, requestId, thinkingDelta, contentDelta),
        );
      },
      onForeignToolActivity: (requestId, index, activity) => {
        // A receipt can land after this client let go of its stream (stop).
        settleSteer(activity);

        setMessages((prev) =>
          applyToolActivity(prev, requestId, index, activity),
        );
      },
      onForeignDone: (requestId, result) => {
        result.toolCalls.forEach(settleSteer);
        setMessages((prev) => applyDone(prev, requestId, result));
      },
      // The server already persisted the error into the row.
      onForeignError: refreshMessages,
    },
    activeChatId,
  );

  // Viewer cleanup (adoption gone / daemon idle): only a foreign entry is
  // cleared — a stream this client started meanwhile owns the entry.
  const clearViewerState = useCallback(
    (requestId?: number) => {
      if (activeChatId === null) return;
      const id = getStreamingId(activeChatId);
      if (id === -1 || candidateLiveStream(activeChatId) !== null) return;
      if (requestId !== undefined && id !== requestId) return;
      if (id === null) return;
      finishStreamEntry(activeChatId);
      refreshMessages();
    },
    [activeChatId, refreshMessages],
  );

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
    // A stream another client started: adopt as a viewer. No echo guard and
    // no claim — this client writes nothing, so frames stay "visible" to it.
    onForeign: (requestId) => {
      if (activeChatId === null) return;
      if (getStreamingId(activeChatId) === requestId) return;
      startStreamEntry(activeChatId, requestId);
    },
    onForeignGone: (requestId) => clearViewerState(requestId),
    onNone: () => clearViewerState(),
  });

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
      forgetStreamStopped(assistantId);
      if (doneChatId === null) return;
      finishStreamEntry(doneChatId);
      clearStreamActivity(doneChatId);
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
      forgetStreamStopped(assistantId);
      if (doneChatId === null) return;
      finishStreamEntry(doneChatId);
      clearStreamActivity(doneChatId);
    },
    [activeChatId, setMessages, updateMessage],
  );

  const send = useCallback(
    async (text: string, images: string[], opts?: ISendOptions) => {
      if (!text.trim() && images.length === 0)
        return { needsSettings: false as const };

      // Checked before enqueue so a queued message is never lost to a missing
      // key at drain time.
      if (!apiKeyPresent && chatModel.source !== "local") {
        return { needsSettings: true as const };
      }

      // A /command resolves to the skill body and is persisted that way, so
      // the instructions survive context rebuilds on later turns.
      let content = text;
      const commands = findSlashCommands(text);

      // Checked before the claim is taken so a second send queues instead of
      // starting a turn of its own.
      const busyAtEntry =
        activeChatId !== null &&
        (isChatBusy(activeChatId) ||
          candidateLiveStream(activeChatId) !== null);
      // Claimed before the slash lookup below is awaited, so the drain effect
      // cannot re-fire while it runs and two quick slash sends cannot both
      // pass the busy check.
      const claimed = activeChatId !== null && !busyAtEntry;
      if (claimed) startStreamEntry(activeChatId, -1);

      if (commands.length > 0) {
        const details = await Promise.all(
          commands.map((command) =>
            rpc.skills.get({ name: command.name }).catch(() => null),
          ),
        );

        const index = details.findIndex(Boolean);
        const detail = details[index];
        if (detail) {
          const { name, args } = commands[index];
          content = SkillMessage.build(name, args, detail.body);
        }
      }

      if (busyAtEntry) {
        enqueue(content, images);
        return { needsSettings: false as const };
      }

      let currentChatId = activeChatId;
      if (!currentChatId) {
        const newId = await rpc.chats.create({
          title: "New chat",
          model: chatModel,
        });

        currentChatId = Number(newId);
        onChatCreated?.(currentChatId);
      }

      if (!currentChatId) {
        if (claimed) {
          finishStreamEntry(activeChatId);
          clearStreamActivity(activeChatId);
        }
        return { needsSettings: false as const };
      }

      let userMessageId: number | null;
      try {
        userMessageId = await insertMessage(
          currentChatId,
          "user",
          content,
          images.length > 0 ? images : undefined,
        );
      } catch (err) {
        if (claimed) {
          finishStreamEntry(activeChatId);
          clearStreamActivity(activeChatId);
        }
        throw err;
      }
      if (userMessageId === null) {
        if (claimed) {
          finishStreamEntry(activeChatId);
          clearStreamActivity(activeChatId);
        }
        return { needsSettings: false as const };
      }

      const userMessage: Message = {
        id: userMessageId,
        role: "user",
        content,
        images: images.length > 0 ? images : undefined,
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
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

  // Queue read from the store, send via a latest ref (React Native may lack
  // useEffectEvent): either as a dep would let the drain's emit cancel the send.
  const sendRef = useRef(send);

  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    if (activeChatId === null) return;
    if (isChatBusy(activeChatId) || isStreaming(activeChatId)) return;
    const [next, ...rest] = getQueued(activeChatId);
    if (!next) return;
    drain(next, rest);
    // Deferred past the effect body (react-hooks/set-state-in-effect);
    // cancelled guards a chat switch in between.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      void sendRef.current(next.text, next.images, {
        skipTitleInference: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeChatId, busy, streamingId, drain]);

  const abort = useCallback(() => {
    if (streamingId === null || activeChatId === null) return;
    abortStream(streamingId);
    // Stopped, not released: the daemon still emits the final pulse and
    // chat:done for this stream, and chatSync must keep treating them as
    // this client's late frames.
    markStreamStopped(streamingId);
    clearStreamActivity(activeChatId);
    finishStreamEntry(activeChatId);
  }, [activeChatId, streamingId, abortStream]);

  const steer = useCallback(
    (queuedId: number) => {
      if (activeChatId === null || streamingId === null) return;
      const item = queuedMessages.find((q) => q.id === queuedId);
      if (!item || steerStateOf(item, streamingId) !== "ready") return;
      // Hand-built: React Native (Hermes) has no crypto.randomUUID.
      const key = `${streamingId}.${queuedId}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      if (!appendStream(streamingId, item.text, key)) return;
      markSteering(activeChatId, queuedId, { requestId: streamingId, key });
    },
    [activeChatId, streamingId, queuedMessages, appendStream],
  );

  const compactNow = useCallback(async (): Promise<
    "compacted" | "nothing" | "error"
  > => {
    if (activeChatId === null || isCompacting) return "nothing";
    setIsCompacting(true);
    try {
      const res = await rpc.chats.compact({ id: activeChatId, force: true });
      if (!("summary" in res)) return "nothing";
      onSummaryChanged?.();
      return "compacted";
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

      // Wipe the row first: a persisted error marker would replay to the model
      // as its own reply, and old tool results would crowd out the fresh turn.
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
      await updateMessage(userMessageId, { content: newText });
      const updatedUser: Message = {
        ...messages[idx],
        content: newText,
        images: newImages && newImages.length > 0 ? newImages : undefined,
      };
      const updatedMessages = [...messages.slice(0, idx), updatedUser];
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
