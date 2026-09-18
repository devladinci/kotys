import { useCallback, useEffect, useRef, useState } from "react";
import { getRpc, getSocket } from "../shared/clients.js";
import { usePlatform } from "../shared/provider.js";
import { isEchoSuppressed } from "./echoGuard.js";
import type { Message } from "./types.js";

type MessageRow = {
  id: number;
  chat_id: number;
  role: Message["role"];
  content: string;
  thinking: string | null;
  images: string | null;
  model_name: string | null;
  prompt_tokens: number | null;
  eval_tokens: number | null;
  tokens_measured: number | null;
  tool_calls: string | null;
  tool_result_tokens?: number | null;
  created_at: number;
};

const rowToMessage = (r: MessageRow): Message => ({
  id: r.id,
  role: r.role,
  content: r.content,
  thinking: r.thinking || undefined,
  images: r.images ? JSON.parse(r.images) : undefined,
  model: r.model_name || undefined,
  promptTokens: r.prompt_tokens ?? undefined,
  evalTokens: r.eval_tokens ?? undefined,
  tokensMeasured:
    r.tokens_measured == null ? undefined : r.tokens_measured === 1,
  toolCalls: parseToolCalls(r.tool_calls),
  toolResultTokens: r.tool_result_tokens ?? undefined,
  createdAt: r.created_at,
});

// Sparse arrays (index gaps in live tool events) and null entries must not
// reach renderers that index into them unchecked.
function parseToolCalls(json: string | null): Message["toolCalls"] {
  if (!json) return undefined;
  const parsed = JSON.parse(json) as Message["toolCalls"];
  const clean = parsed?.filter(Boolean);
  return clean && clean.length > 0 ? clean : undefined;
}

/** Coalesce bursts of change events (a send emits several) into one reload. */
export function debounceSync<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}

export function useMessages(activeChatId: number | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const messagesReadyForRef = useRef<number | null>(null);
  const platform = usePlatform();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchMessages = useCallback(
    async (chatId: number): Promise<Message[] | null> => {
      try {
        const rows = (await getRpc().messages.list({
          chatId,
        })) as unknown as MessageRow[];
        if (!mountedRef.current || messagesReadyForRef.current !== chatId) {
          return null;
        }
        const parsed = rows.map(rowToMessage);
        setMessages(parsed);
        return parsed;
      } catch {
        // Transient RPC failure: keep current state, next event retries.
        return null;
      }
    },
    [],
  );

  // Refetch on messages:changed for this chat, unless an echo of our own
  // stream would clobber live state (see streamActivity).
  useEffect(() => {
    if (activeChatId === null) return;
    const refetch = debounceSync(() => {
      if (!mountedRef.current) return;
      if (isEchoSuppressed(activeChatId)) return;
      void fetchMessages(activeChatId);
    }, 250);
    const off = getSocket().on((msg) => {
      if (msg.type !== "messages:changed") return;
      if (msg.payload.chatId !== activeChatId) return;
      if (msg.payload.messageId === -1) return;
      refetch();
    });
    return () => {
      off();
      refetch.cancel();
    };
  }, [activeChatId, fetchMessages]);

  // One message per pulse is enough: the server persists streaming progress
  // every second, so this heals a viewer that joined mid-stream without a
  // chat-wide refetch. The 400ms debounce also coalesces overlapping pulses.
  const pendingRowIdsRef = useRef(new Set<number>());
  const refreshMessage = useCallback(
    (id: number) => {
      const pending = pendingRowIdsRef.current;
      if (pending.has(id)) return;
      pending.add(id);
      setTimeout(() => {
        pending.delete(id);
        void (async () => {
          try {
            const row = (await getRpc().messages.get({
              id,
            })) as unknown as MessageRow | null;
            if (!row || !mountedRef.current) return;
            if (row.chat_id !== activeChatId) return;
            const parsed = rowToMessage(row);
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === id);
              if (idx === -1) return prev;
              const current = prev[idx];
              // Stream output is append-only, so a live delta can only be
              // ahead of a pulse-row snapshot; keep the longer side. A stale
              // pulse racing a chunk must not regress the visible text.
              const regressed =
                parsed.content.length < current.content.length ||
                (parsed.thinking ?? "").length <
                  (current.thinking ?? "").length;
              if (regressed) return prev;
              const next = [...prev];
              next[idx] = {
                ...parsed,
                toolCalls: parsed.toolCalls ?? current.toolCalls,
                livePromptTokens: current.livePromptTokens,
              };
              return next;
            });
          } catch {
            // transient; the next pulse retries
          }
        })();
      }, 400);
    },
    [activeChatId],
  );

  // The 1s streaming pulse: a viewer of the streaming message keeps its live
  // deltas, but one that joined mid-stream (or whose socket dropped and
  // reconnected) has stale/empty text. Pulling just that one row on the pulse
  // heals it without a chat-wide refetch every second.
  useEffect(() => {
    if (activeChatId === null) return;
    const off = getSocket().on((msg) => {
      if (msg.type !== "messages:progress") return;
      if (msg.payload.chatId !== activeChatId) return;
      if (isEchoSuppressed(activeChatId)) return; // our own stream owns the view
      refreshMessage(msg.payload.messageId);
    });
    return () => {
      off();
    };
  }, [activeChatId, refreshMessage]);

  // The socket drops while a phone is locked and every broadcast emitted in
  // that window is gone for good. On regaining the connection (or coming back
  // to the foreground), pull the chat fresh instead of trusting stale state —
  // unless a stream is live for this chat, whose echo guard already owns the
  // view (a refetch would clobber in-flight text with the empty DB row).
  useEffect(() => {
    if (activeChatId === null) return;
    let lastStatus = getSocket().status;
    const offStatus = getSocket().onStatus((status) => {
      if (status === "connected" && lastStatus !== "connected") {
        lastStatus = status;
        if (!isEchoSuppressed(activeChatId)) void fetchMessages(activeChatId);
      }
    });
    const offForeground = platform.onAppForeground?.(() => {
      if (!isEchoSuppressed(activeChatId)) void fetchMessages(activeChatId);
    });
    return () => {
      offStatus();
      offForeground?.();
    };
  }, [activeChatId, fetchMessages, platform]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- load messages on chat switch */
    if (activeChatId === null) {
      setMessages([]);
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    let cancelled = false;
    void (async () => {
      const rows = (await getRpc().messages.list({
        chatId: activeChatId,
      })) as unknown as MessageRow[];
      if (cancelled || !mountedRef.current) return;
      const parsed: Message[] = rows.map(rowToMessage);
      setMessages(parsed);
      messagesReadyForRef.current = activeChatId;
      if (pendingScrollId !== null) {
        const target = pendingScrollId;
        setPendingScrollId(null);
        setTimeout(() => {
          platform.scrollToMessage(target);
          setHighlightId(target);
          setTimeout(() => setHighlightId(null), 1600);
        }, 80);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChatId, pendingScrollId, platform]);

  const insertMessage = useCallback(
    async (
      chatId: number,
      role: string,
      content: string,
      images?: string[],
    ): Promise<number | null> => {
      return getRpc().messages.insert({
        chatId,
        role,
        content,
        images,
      });
    },
    [],
  );

  const updateMessage = useCallback(
    async (
      id: number,
      fields: {
        content?: string;
        thinking?: string;
        promptTokens?: number;
        evalTokens?: number;
        tokensMeasured?: boolean;
        toolCalls?: string;
      },
    ): Promise<void> => {
      await getRpc().messages.update({ id, ...fields });
    },
    [],
  );

  const setPendingScroll = useCallback((id: number | null) => {
    setPendingScrollId(id);
  }, []);

  /** Re-pull the current chat from the daemon (reconnect, foreground). */
  const refresh = useCallback(() => {
    if (activeChatId === null) return;
    void fetchMessages(activeChatId);
  }, [activeChatId, fetchMessages]);

  const openSearchResult = useCallback(
    (r: { id: number; chat_id: number }, currentActiveId: number | null) => {
      if (currentActiveId === r.chat_id) {
        platform.scrollToMessage(r.id);
        setHighlightId(r.id);
        setTimeout(() => setHighlightId(null), 1600);
      } else {
        setPendingScrollId(r.id);
      }
      return r.chat_id;
    },
    [platform],
  );

  return {
    messages,
    setMessages,
    insertMessage,
    updateMessage,
    pendingScrollId,
    setPendingScroll,
    highlightId,
    openSearchResult,
    messagesReadyForRef,
    refresh,
    refreshMessage,
  };
}
