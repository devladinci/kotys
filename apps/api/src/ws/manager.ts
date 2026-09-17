import { randomUUID } from "node:crypto";
import type { WSContext } from "hono/ws";
import type { ChatStreamResult } from "@kotys/contracts";
import { ERROR_TURN_PREFIX } from "@kotys/contracts";
import { getMessage, getChatIdForMessage, updateMessage } from "@kotys/db";
import { events } from "../services/events.js";
import { resolveApproval } from "../services/approval.js";
import { resolveUserInput } from "../services/input.js";
import { streamChat } from "../services/chatStream.js";
import {
  startPomodoro,
  pausePomodoro,
  resumePomodoro,
  stopPomodoro,
  skipBreak,
} from "../services/pomodoro.js";
import type { ClientMessage, ServerMessage } from "./protocol.js";
import {
  abortStream,
  beginStream,
  chatIdOf,
  drainAppends,
  finishStream,
  framesAfter,
  isLive,
  queueAppend,
  record,
} from "./streams.js";

type Client = { id: string; ws: WSContext };

const clients = new Map<string, Client>();

function send(client: Client, msg: ServerMessage): void {
  try {
    client.ws.send(JSON.stringify(msg));
  } catch {
    // A dead socket throws here; onClose removes the client.
  }
}

function broadcast(msg: ServerMessage): void {
  for (const client of clients.values()) send(client, msg);
}

function broadcastFrame(requestId: number, frame: ServerMessage): void {
  let chatId = chatIdOf(requestId);
  if (chatId === undefined) {
    chatId = getChatIdForMessage(requestId) ?? undefined;
  }
  broadcast({ ...frame, ...(chatId !== undefined ? { chatId } : {}) });
}

// Call once at startup; each call adds another set of listeners.
export function bindEvents(): void {
  events.onEvent("chats:changed", (p) =>
    broadcast({ type: "chats:changed", payload: p }),
  );

  events.onEvent("messages:changed", (p) =>
    broadcast({ type: "messages:changed", payload: p }),
  );

  events.onEvent("messages:progress", (p) =>
    broadcast({ type: "messages:progress", payload: p }),
  );

  events.onEvent("approval:request", (p) =>
    broadcast({ type: "approval:request", payload: p }),
  );

  events.onEvent("approval:cancel", (p) =>
    broadcast({ type: "approval:cancel", payload: p }),
  );

  events.onEvent("input:request", (p) =>
    broadcast({ type: "input:request", payload: p }),
  );

  events.onEvent("input:cancel", (p) =>
    broadcast({ type: "input:cancel", payload: p }),
  );

  events.onEvent("pomodoro:tick", (p) =>
    broadcast({ type: "pomodoro:tick", payload: p }),
  );

  events.onEvent("pomodoro:started", (p) =>
    broadcast({ type: "pomodoro:started", payload: p }),
  );

  events.onEvent("pomodoro:done", (p) =>
    broadcast({ type: "pomodoro:done", payload: p }),
  );

  events.onEvent("todos:changed", () => broadcast({ type: "todos:changed" }));

  events.onEvent("todos:open", (p) =>
    broadcast({ type: "todos:open", payload: p }),
  );

  events.onEvent("skills:changed", () => broadcast({ type: "skills:changed" }));

  events.onEvent("open-url", (p) =>
    broadcast({ type: "open-url", payload: p }),
  );

  events.onEvent("notify", (p) => broadcast({ type: "notify", payload: p }));
}

export function onOpen(ws: WSContext): string {
  const id = randomUUID();
  clients.set(id, { id, ws });
  send({ id, ws }, { type: "ready", payload: { clientId: id } });
  return id;
}

export function onClose(clientId: string): void {
  clients.delete(clientId);
}

function persistResult(
  requestId: number,
  result: ChatStreamResult | null,
  error?: string,
): void {
  try {
    const row = getMessage(requestId);
    if (!row || row.role !== "assistant") return;
    let content: string;
    let thinking: string | undefined;
    let toolCalls: string | undefined;
    if (result) {
      content = result.content || "_(stopped)_";
      thinking = result.thinking || undefined;
      toolCalls =
        result.toolCalls.length > 0
          ? JSON.stringify(result.toolCalls)
          : undefined;
    } else {
      const partial = row.content || "";
      content = partial
        ? `${partial}\n\n${ERROR_TURN_PREFIX} ${error ?? "stream failed"}`
        : `${ERROR_TURN_PREFIX} ${error ?? "stream failed"}`;
      thinking = row.thinking || undefined;
    }
    // 0 usage means "no measurement" — writing it would fake an anchor.
    updateMessage(requestId, {
      content,
      ...(thinking !== undefined ? { thinking } : {}),
      ...(result?.promptTokens ? { promptTokens: result.promptTokens } : {}),
      ...(result?.evalTokens ? { evalTokens: result.evalTokens } : {}),
      ...(result?.tokensMeasured !== undefined
        ? { tokensMeasured: result.tokensMeasured }
        : {}),
      ...(toolCalls !== undefined ? { toolCalls } : {}),
    });
    const chatId = getChatIdForMessage(requestId);
    if (chatId !== null) {
      events.emitEvent("messages:changed", { chatId, messageId: requestId });
    }
  } catch {
    // Best effort: the owning client is the primary writer.
  }
}

type ResumeFallback = Extract<
  ServerMessage,
  { type: "chat:done" } | { type: "chat:error" }
>;

function resumeFallback(requestId: number): ResumeFallback | null {
  try {
    const row = getMessage(requestId);
    if (!row) {
      return {
        type: "chat:error",
        seq: 0,
        payload: { requestId, error: "stream expired" },
      };
    }
    const result: ChatStreamResult = {
      content: row.content,
      thinking: row.thinking ?? "",
      promptTokens: row.prompt_tokens ?? 0,
      evalTokens: row.eval_tokens ?? 0,
      tokensMeasured: row.tokens_measured !== 0,
      toolCalls: row.tool_calls
        ? (JSON.parse(row.tool_calls) as ChatStreamResult["toolCalls"])
        : [],
    };
    return {
      type: "chat:done",
      seq: 0,
      payload: { requestId, result },
    };
  } catch {
    return null;
  }
}

export async function onMessage(clientId: string, raw: string): Promise<void> {
  const client = clients.get(clientId);
  if (!client) return;

  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    return;
  }

  switch (msg.type) {
    case "ping":
      send(client, { type: "pong" });
      return;

    case "chat:stream": {
      const { requestId, chatId } = msg.payload;
      const controller = beginStream(requestId, chatId);
      try {
        const result = await streamChat(
          msg.payload,
          {
            onChunk: (chunk) => {
              const frame = record(requestId, {
                type: "chat:chunk",
                payload: { requestId, ...chunk },
              });
              if (frame) broadcastFrame(requestId, frame);
            },
            onToolActivity: (activity, index) => {
              const frame = record(requestId, {
                type: "chat:tool",
                payload: { ...activity, requestId, index },
              });
              if (frame) broadcastFrame(requestId, frame);
            },
            pendingAppends: () => drainAppends(requestId),
          },
          controller.signal,
        );
        const done = record(requestId, {
          type: "chat:done",
          payload: { requestId, result },
        });
        // The owner client may be gone (phone asleep), so the server saves too.
        persistResult(requestId, result);
        if (done) broadcastFrame(requestId, done);
      } catch (err) {
        const error = String(err);
        const frame = record(requestId, {
          type: "chat:error",
          payload: { requestId, error },
        });
        persistResult(requestId, null, error);
        if (frame) broadcastFrame(requestId, frame);
      } finally {
        finishStream(requestId);
      }
      return;
    }

    case "chat:abort":
      abortStream(msg.payload.requestId);
      return;

    case "chat:append": {
      const { requestId, content, id } = msg.payload;
      if (typeof content !== "string" || !content.trim()) return;
      queueAppend(requestId, {
        content,
        ...(typeof id === "string" && id ? { id } : {}),
      });
      return;
    }

    case "chat:resume": {
      const { requestId, lastSeq } = msg.payload;
      let chatId = chatIdOf(requestId);
      if (chatId === undefined) {
        chatId = getChatIdForMessage(requestId) ?? undefined;
      }
      const frames = framesAfter(requestId, lastSeq);
      if (frames.length > 0) {
        // Replay carries the chatId stamp like a live broadcast: the resuming
        // client classifies frames by it (its own view state depends on it).
        for (const frame of frames) {
          if (chatId === undefined || !("seq" in frame)) {
            send(client, frame);
            continue;
          }
          send(client, { ...frame, chatId });
        }
        return;
      }
      // A live stream with nothing past lastSeq must stay open: a synthesized
      // done would end it mid-generation.
      if (isLive(requestId)) return;
      const fallback = resumeFallback(requestId);
      if (fallback) {
        if (chatId === undefined) {
          send(client, fallback);
        } else {
          send(client, { ...fallback, chatId });
        }
      }
      return;
    }

    case "approval:response":
      resolveApproval(msg.payload.id, msg.payload.approved);
      return;

    case "input:response":
      resolveUserInput(msg.payload.id, msg.payload.answers ?? undefined);
      return;

    case "pomodoro:start":
      startPomodoro(msg.payload);
      return;

    case "pomodoro:pause":
      pausePomodoro();
      return;

    case "pomodoro:resume":
      resumePomodoro();
      return;

    case "pomodoro:stop":
      stopPomodoro();
      return;

    case "pomodoro:skip-break":
      skipBreak();
      return;
  }
}
