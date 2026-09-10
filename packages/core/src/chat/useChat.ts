import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatStreamResult, ModelListing } from "@kotys/contracts";
import { hostFor, useAppStore } from "../shared/useAppStore.js";
import { getRpc } from "../shared/clients.js";
import {
  buildSkillMessage,
  extractSkillMessage,
  parseSlashCommand,
} from "../skills/slashCommand.js";
import { useTodoStore } from "../todos/useTodoStore.js";
import { projectedUsedTokens } from "./useTokenEstimator.js";
import type { ToolDelta } from "./streamThrottle.js";
import { StreamCollector, mergeChunks, mergeTools } from "./streamThrottle.js";
import { declareStreamActivity } from "./echoGuard.js";
import { useMessages } from "./useMessages.js";
import { applyChunk, applyDone, applyToolActivity } from "./streamFrames.js";
import { useChatActions } from "./useChatActions.js";
import { useChatStream } from "./useChatStream.js";
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

  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<number | null>(null);
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
  // Synchronous busy flag: send() runs after an await, where isLoading state
  // is still stale, so the queue drain could double-fire without this.
  const busyRef = useRef(false);

  const {
    messages,
    setMessages,
    insertMessage,
    updateMessage,
    openSearchResult,
    messagesReadyForRef,
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

  const { stream, abort: abortStream } = useChatStream(
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
    streamingId,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
                toolCalls:
                  result.toolCalls.length > 0 ? result.toolCalls : undefined,
              }
            : m,
        ),
      );
      streamBuffersRef.current.delete(assistantId);
      toolBuffersRef.current.delete(assistantId);
      setStreamingId(null);
      setIsLoading(false);
      busyRef.current = false;
      declareStreamActivity(null);
      return { finalContent, result };
    },
    [chatModel.name, setMessages, updateMessage],
  );

  const finaliseError = useCallback(
    async (assistantId: number, errorMsg: string) => {
      const buf = streamBuffersRef.current.get(assistantId);
      const tools = toolBuffersRef.current.get(assistantId)?.filter(Boolean);
      const errorContent = `${buf?.content ? buf.content + "\n\n" : ""}**Error:** ${errorMsg}`;
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
      setStreamingId(null);
      setIsLoading(false);
      busyRef.current = false;
      declareStreamActivity(null);
    },
    [setMessages, updateMessage],
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
            content = buildSkillMessage(slash.name, slash.args, detail.body);
          } else if (slash.args === "") {
            // Unknown bare /command: leave as typed; the model sees it and
            // can say the skill does not exist.
            content = text;
          }
        } catch {
          content = text;
        }
      }

      // While a stream is running, park the message; it drains FIFO on idle.
      if (busyRef.current || isLoading || streamingId !== null) {
        enqueue(content, images);
        return { needsSettings: false as const };
      }
      // Claimed before the first await: the drain effect re-runs on the
      // setQueuedMessages render and must not double-fire while this send
      // is still awaiting its RPCs.
      busyRef.current = true;

      // Presence, not value: the key never leaves the daemon (write-only RPC).
      if (!apiKeyPresent && chatModel.source !== "local") {
        return { needsSettings: true as const };
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
      setIsLoading(true);
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
          declareStreamActivity(null); // chat deleted mid-send
          setIsLoading(false);
          busyRef.current = false;
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
        setStreamingId(newAssistantId);

        // Registered before stream() so an instant done/error finds it.
        pendingInferenceRef.current.set(newAssistantId, {
          chatId: currentChatId,
          userText: extractSkillMessage(content)?.args || text,
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
        declareStreamActivity(null);
        setIsLoading(false);
        busyRef.current = false;
        if (assistantMessageId !== null) {
          await finaliseError(assistantMessageId, errorMsg);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              role: "assistant",
              content: `**Error:** ${errorMsg}`,
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
      isLoading,
      messages,
      onChatCreated,
      onTitleInferred,
      permissionMode,
      rpc,
      setMessages,
      stream,
      streamingId,
      thinkingEffort,
      enqueue,
    ],
  );

  // Auto-send a pending todo prompt once messages land.
  useEffect(() => {
    if (activeChatId === null || isLoading) return;
    if (messagesReadyForRef.current !== activeChatId) return;
    const prompt = useTodoStore.getState().consumePendingPrompt();
    if (!prompt) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void send(prompt, [], { skipTitleInference: true });
    });
    return () => {
      cancelled = true;
    };
  }, [activeChatId, messages, isLoading, send, messagesReadyForRef]);

  // Drain the queue: one message per idle transition, FIFO.
  useEffect(() => {
    if (isLoading || streamingId !== null || busyRef.current) return;
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
  }, [isLoading, streamingId, queuedMessages, send, drain]);

  const abort = useCallback(() => {
    if (streamingId !== null) {
      abortStream(streamingId);
      // If the socket died, chat:done never arrives — clear the guard here too.
      declareStreamActivity(null);
      setIsLoading(false);
      setStreamingId(null);
      busyRef.current = false;
    }
  }, [streamingId, abortStream]);

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
      setIsLoading(true);
      setStreamingId(assistantId);
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
      setIsLoading(true);
      setStreamingId(newAssistantId);
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
  };
}
