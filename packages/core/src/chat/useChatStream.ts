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

export function useChatStream(
  handlers: StreamFrameHandlers,
  activeChatId: number | null,
) {
  const socket = useSocket();
  const handlersRef = useRef(handlers);
  const activeChatIdRef = useRef(activeChatId);

  // Latest-ref sync, not useEffectEvent: React Native does not guarantee it.
  useEffect(() => {
    handlersRef.current = handlers;
    activeChatIdRef.current = activeChatId;
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
        activeChatIdRef.current,
      );
      if (decision === "ignore") return;
      const own = decision === "own";
      if (msg.type === "chat:chunk") {
        const { thinkingDelta, contentDelta } = msg.payload;
        if (own) cb.onOwnChunk(requestId, thinkingDelta, contentDelta);
        else cb.onForeignChunk(requestId, thinkingDelta, contentDelta);
        return;
      }
      if (msg.type === "chat:tool") {
        const { requestId: id, index, ...activity } = msg.payload;
        if (own) cb.onOwnToolActivity(id, index, activity as ToolActivity);
        else cb.onForeignToolActivity(id, index, activity as ToolActivity);
        return;
      }
      if (msg.type === "chat:done") {
        if (own) cb.onOwnDone(requestId, msg.payload.result);
        else cb.onForeignDone(requestId, msg.payload.result);
        return;
      }
      if (own) cb.onOwnError(requestId, msg.payload.error);
      else cb.onForeignError();
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

  // False when the socket is down: appends are never parked for replay.
  const appendStream = useCallback(
    (requestId: number, content: string, id: string) =>
      socket.send({
        type: "chat:append",
        payload: { requestId, content, id },
      }),
    [socket],
  );

  return { stream, abort, appendStream };
}
