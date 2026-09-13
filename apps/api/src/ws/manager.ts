import { randomUUID } from "node:crypto";
import type { WSContext } from "hono/ws";
import type { ChatStreamResult } from "@kotys/contracts";
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
  finishStream,
  framesAfter,
  isLive,
  record,
} from "./streams.js";

type Client = { id: string; ws: WSContext };

const clients = new Map<string, Client>();

function send(client: Client, msg: ServerMessage): void {
  try {
    client.ws.send(JSON.stringify(msg));
  } catch {
    // Socket died between the check and the write; the close handler cleans up.
  }
}

function broadcast(msg: ServerMessage): void {
  for (const client of clients.values()) send(client, msg);
}

/** Stream frames go to every client watching the chat, not just the owner. */
function broadcastFrame(requestId: number, frame: ServerMessage): void {
  let chatId = chatIdOf(requestId);
  if (chatId === undefined) {
    chatId = getChatIdForMessage(requestId) ?? undefined;
  }
  broadcast({ ...frame, ...(chatId !== undefined ? { chatId } : {}) });
}

/** Wire the event bus to every connected socket. Call once at startup. */
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

/**
 * Save the finished stream to SQLite and let every client know, so a reply
 * survives even when the sending client vanished mid-generation. When the
 * owning client later writes the same content, the identical update just
 * re-broadcasts.
 */
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
        ? `${partial}\n\n**Error:** ${error ?? "stream failed"}`
        : `**Error:** ${error ?? "stream failed"}`;
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
    // The owning client is the primary writer; a persistence failure here is
    // not worth tearing down the socket over.
  }
}

/**
 * Terminal frame for a `chat:resume` whose replay buffer no longer exists.
 * Rebuilds `chat:done` from the persisted message when the server saved it;
 * without a row the client would spin forever, so synthesize an error.
 */
function resumeFallback(requestId: number): ServerMessage | null {
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
          },
          controller.signal,
        );
        const done = record(requestId, {
          type: "chat:done",
          payload: { requestId, result },
        });
        // The owning client usually persists the reply itself, but it may be
        // gone (phone asleep, screen closed) — the server saves it too.
        persistResult(requestId, result);
        if (done) broadcastFrame(requestId, done);
      } catch (err) {
        const error = String(err);
        const frame = record(requestId, {
          type: "chat:error",
          payload: { requestId, error },
        });
        // Keep whatever the model produced before failing, so the tail of the
        // conversation is not just an empty bubble.
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

    case "chat:resume": {
      const { requestId, lastSeq } = msg.payload;
      const frames = framesAfter(requestId, lastSeq);
      if (frames.length > 0) {
        for (const frame of frames) send(client, frame);
        return;
      }
      // Buffer gone (expired or daemon restarted): synthesize a terminal
      // frame from the database so the client stops its spinner. A still-live
      // stream with nothing past lastSeq must stay open — a synthesized done
      // would end it mid-generation.
      if (isLive(requestId)) return;
      const fallback = resumeFallback(requestId);
      if (fallback) send(client, fallback);
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
