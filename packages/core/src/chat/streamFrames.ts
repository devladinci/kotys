import type { ChatStreamResult, ToolActivity } from "@kotys/contracts";
import { hasLiveStream } from "./liveStreams.js";
import type { Message } from "./types.js";

/**
 * What to do with an incoming stream frame: `own` — this client started the
 * stream; `visible` — someone else's stream, but into the chat this client
 * has open; `ignore` — someone else's stream elsewhere.
 */
export type FrameDecision = "own" | "visible" | "ignore";

/**
 * `own` is decided by the live-stream registry (requestId → chatId claims),
 * not by a single active streamingId: several chats can stream in parallel
 * and frames for a background chat must keep flowing to its buffers. The
 * claim check must not depend on which chat is open — a stream this client
 * started is its own even when the user is reading another chat.
 */
export function classifyFrame(
  requestId: number,
  frameChatId: number | undefined,
  activeChatId: number | null,
): FrameDecision {
  if (hasLiveStream(requestId)) return "own";
  if (frameChatId !== undefined && frameChatId === activeChatId) {
    return "visible";
  }
  return "ignore";
}

export function applyChunk(
  messages: Message[],
  requestId: number,
  thinkingDelta: string,
  contentDelta: string,
): Message[] {
  const idx = messages.findIndex((m) => m.id === requestId);
  if (idx === -1) return messages;
  const m = messages[idx];
  const next = [...messages];
  next[idx] = {
    ...m,
    thinking: (m.thinking ?? "") + thinkingDelta,
    content: m.content + contentDelta,
  };
  return next;
}

export function applyToolActivity(
  messages: Message[],
  requestId: number,
  index: number,
  activity: ToolActivity,
): Message[] {
  const idx = messages.findIndex((m) => m.id === requestId);
  if (idx === -1) return messages;
  const m = messages[idx];
  const toolCalls = [...(m.toolCalls ?? [])];
  while (toolCalls.length < index) toolCalls.push(undefined as never);
  toolCalls[index] = activity;
  const next = [...messages];
  next[idx] = { ...m, toolCalls: toolCalls.filter(Boolean) };
  return next;
}

export function applyDone(
  messages: Message[],
  requestId: number,
  result: ChatStreamResult,
): Message[] {
  const idx = messages.findIndex((m) => m.id === requestId);
  if (idx === -1) return messages;
  const m = messages[idx];
  const next = [...messages];
  next[idx] = {
    ...m,
    content: result.content || m.content,
    thinking: result.thinking || m.thinking,
    promptTokens: result.promptTokens || m.promptTokens,
    evalTokens: result.evalTokens || m.evalTokens,
    tokensMeasured: result.tokensMeasured || m.tokensMeasured,
    toolCalls: result.toolCalls.length > 0 ? result.toolCalls : m.toolCalls,
  };
  return next;
}
