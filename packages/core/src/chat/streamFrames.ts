import type { ChatStreamResult, ToolActivity } from "@kotys/contracts";
import { hasLiveStream } from "./liveStreams.js";
import type { Message } from "./types.js";

/**
 * What to do with an incoming stream frame: `own` — this client started the
 * stream; `visible` — someone else's stream, but into the chat this client
 * has open; `ignore` — someone else's stream elsewhere.
 */
export type FrameDecision = "own" | "visible" | "ignore";

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

export function applyUsage(
  messages: Message[],
  requestId: number,
  promptTokens: number,
): Message[] {
  const idx = messages.findIndex((m) => m.id === requestId);
  if (idx === -1) return messages;
  const next = [...messages];
  next[idx] = { ...messages[idx], livePromptTokens: promptTokens };
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
    toolResultTokens: result.toolResultTokens || m.toolResultTokens,
    livePromptTokens: undefined,
  };
  return next;
}
