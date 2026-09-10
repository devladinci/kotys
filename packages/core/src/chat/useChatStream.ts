import { useCallback, useEffect, useRef } from "react";
import type {
  ChatStreamResult,
  ModelListing,
  PermissionMode,
  ThinkEffort,
  ToolActivity,
} from "@kotys/contracts";
import { useSocket } from "../shared/provider.js";
import type { Message } from "./types.js";
import { classifyFrame } from "./streamFrames.js";

const stripDataUrl = (s: string) => s.replace(/^data:[^;,]+;base64,/, "");

export type StreamFrameHandlers = {
  /** This client's own stream — full lifecycle handling. */
  onOwnChunk: (
    requestId: number,
    thinkingDelta: string,
    contentDelta: string,
  ) => void;
  onOwnToolActivity: (
    requestId: number,
    index: number,
    activity: ToolActivity,
  ) => void;
  onOwnDone: (requestId: number, result: ChatStreamResult) => void;
  onOwnError: (requestId: number, error: string) => void;
  /** Someone else's stream into the chat this client is viewing. */
  onForeignChunk: (
    requestId: number,
    thinkingDelta: string,
    contentDelta: string,
  ) => void;
  onForeignToolActivity: (
    requestId: number,
    index: number,
    activity: ToolActivity,
  ) => void;
  onForeignDone: (requestId: number, result: ChatStreamResult) => void;
  onForeignError: () => void;
};

/**
 * Sends `chat:stream` over the socket and routes the chunk/tool/done/error
 * frames back to the caller. Resume is handled by `KotysSocket` — it tracks
 * `lastSeq` per request and re-requests on reconnect, so the caller sees a
 * continuous chunk sequence even across a dropped socket.
 */
export function useChatStream(
  handlers: StreamFrameHandlers,
  activeChatId: number | null,
  streamingId: number | null,
) {
  const socket = useSocket();
  const handlersRef = useRef(handlers);
  const activeChatIdRef = useRef(activeChatId);
  const streamingIdRef = useRef(streamingId);
  useEffect(() => {
    // The subscription below reads the refs only from socket callbacks, which
    // fire after commit — so this keeps them current without touching refs
    // during render.
    handlersRef.current = handlers;
    activeChatIdRef.current = activeChatId;
    streamingIdRef.current = streamingId;
  });

  useEffect(() => {
    return socket.on((msg) => {
      if (
        msg.type !== "chat:chunk" &&
        msg.type !== "chat:tool" &&
        msg.type !== "chat:done" &&
        msg.type !== "chat:error"
      ) {
        return;
      }
      const cb = handlersRef.current;
      const requestId = msg.payload.requestId;
      const decision = classifyFrame(
        requestId,
        "chatId" in msg ? msg.chatId : undefined,
        streamingIdRef.current,
        activeChatIdRef.current,
      );
      if (decision === "ignore") return;
      const own = decision === "own";
      if (msg.type === "chat:chunk") {
        if (own)
          cb.onOwnChunk(
            requestId,
            msg.payload.thinkingDelta,
            msg.payload.contentDelta,
          );
        else
          cb.onForeignChunk(
            requestId,
            msg.payload.thinkingDelta,
            msg.payload.contentDelta,
          );
      } else if (msg.type === "chat:tool") {
        const { requestId: id, index, ...activity } = msg.payload;
        if (own) cb.onOwnToolActivity(id, index, activity as ToolActivity);
        else cb.onForeignToolActivity(id, index, activity as ToolActivity);
      } else if (msg.type === "chat:done") {
        if (own) cb.onOwnDone(requestId, msg.payload.result);
        else cb.onForeignDone(requestId, msg.payload.result);
      } else if (msg.type === "chat:error") {
        if (own) cb.onOwnError(requestId, msg.payload.error);
        else cb.onForeignError();
      }
    });
  }, [socket]);

  const stream = useCallback(
    (
      requestId: number,
      model: ModelListing,
      host: string,
      messages: Message[],
      think?: ThinkEffort,
      mode?: PermissionMode,
      chatId?: number,
      bounds?: { historyUpto?: number },
    ) => {
      socket.send({
        type: "chat:stream",
        payload: {
          requestId,
          ...(chatId !== undefined ? { chatId } : {}),
          ...(bounds?.historyUpto !== undefined
            ? { historyUpto: bounds.historyUpto }
            : {}),
          host,
          model,
          provider: model.provider ?? "ollama",
          ...(think !== undefined ? { think } : {}),
          ...(mode !== undefined ? { mode } : {}),
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.images && m.images.length > 0
              ? { images: m.images.map(stripDataUrl) }
              : {}),
          })),
        },
      });
    },
    [socket],
  );

  const abort = useCallback(
    (requestId: number) => {
      socket.send({ type: "chat:abort", payload: { requestId } });
    },
    [socket],
  );

  return { stream, abort };
}
