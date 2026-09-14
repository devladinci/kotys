import {
  BASE_SYSTEM_PROMPT,
  formatDateTimeBlock,
  formatMemoryBlock,
} from "./systemPrompt.js";
import {
  deleteTurnsAfter,
  getChatById,
  getMeasuredPrompt,
  getMemoriesForChat,
  getToolResultsForMessages,
  getTurnRowsForChat,
  imagesOf,
} from "@kotys/db";
import {
  estimateTokens,
  IMAGE_TOKENS,
  projectContextTokens,
  usableTokens,
} from "@kotys/contracts";
import type { ToolActivity } from "@kotys/contracts";
import { compactChat } from "./compact.js";
import {
  recordCompactFailure,
  shouldAttemptCompact,
} from "./context-budget.js";
import type { ConnectorChatMessage } from "../llm/registry.js";
import type { ToolResultRow, TurnRow } from "@kotys/db";

export type TurnPayload = {
  /** Absent on the pending client turn, which is always the newest. */
  id?: number;
  role: string;
  content: string;
  images?: string[];
  toolCalls?: {
    id?: string;
    function: { name: string; arguments: Record<string, unknown> };
  }[];
  /** Replayed tool outcome for an assistant turn, keyed to that turn. */
  toolResults?: { toolName: string; content: string }[];
};

const REPLAY_TOOL_BUDGET_TOKENS = 6_000;

const resultsOf = (tool_calls: string | null): ToolActivity[] => {
  if (!tool_calls) return [];
  try {
    const parsed = JSON.parse(tool_calls) as unknown;
    return Array.isArray(parsed) ? (parsed as ToolActivity[]) : [];
  } catch {
    return [];
  }
};

function withToolResults(turns: TurnPayload[], rows: TurnRow[]): TurnPayload[] {
  const results = getToolResultsForMessages(
    rows.filter((r) => r.role === "assistant").map((r) => r.id),
  );
  const byMessage = new Map<number, ToolResultRow[]>();
  for (const r of results) {
    const list = byMessage.get(r.message_id) ?? [];
    list.push(r);
    byMessage.set(r.message_id, list);
  }
  const budgeted = new Set<number>();
  let spent = 0;
  for (const [messageId, rows_] of [...byMessage].reverse()) {
    const cost = rows_.reduce((n, r) => n + estimateTokens(r.content), 0);
    if (spent + cost > REPLAY_TOOL_BUDGET_TOKENS) continue;
    spent += cost;
    budgeted.add(messageId);
  }
  return turns.map((t, i) => {
    const row = rows[i];
    if (row?.role !== "assistant" || !budgeted.has(row.id)) return t;
    const trace = resultsOf(row.tool_calls);
    const results = byMessage.get(row.id) ?? [];
    const named = results.map((r, callIndex) => ({
      name: trace[callIndex]?.tool ?? `tool_${callIndex}`,
      content: r.content,
    }));
    return {
      ...t,
      ...(named.length
        ? {
            toolCalls: named.map((n, callIndex) => ({
              id: `replay_${row.id}_${callIndex}`,
              function: { name: n.name, arguments: {} },
            })),
          }
        : {}),
      toolResults: named.map((n) => ({ toolName: n.name, content: n.content })),
    };
  });
}

function buildSystemContent(
  chatId: number,
  opts: {
    rosterIndex: string;
    skillsIndex: string;
    summary?: string | null;
    now?: Date;
  },
): string {
  const memories = getMemoriesForChat(chatId, 20);
  const memoryLines = memories.map((m) => ({
    id: m.id,
    type: m.type,
    content: m.content,
    topics: m.topics ?? [],
  }));
  return [
    BASE_SYSTEM_PROMPT.trim(),
    ...(opts.rosterIndex.trim() ? [opts.rosterIndex.trim()] : []),
    ...(opts.skillsIndex.trim() ? [opts.skillsIndex.trim()] : []),
    formatMemoryBlock(memoryLines),
    ...(opts.summary
      ? [`Summary of the earlier conversation:\n\n${opts.summary}`]
      : []),
    formatDateTimeBlock(opts.now),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildContextMessages(
  chatId: number,
  clientMessages: TurnPayload[],
  opts: {
    rosterIndex: string;
    skillsIndex: string;
    summary: string | null;
    now?: Date;
  },
): ConnectorChatMessage[] {
  const systemContent = buildSystemContent(chatId, opts);
  const expanded: ConnectorChatMessage[] = [];
  for (const m of clientMessages) {
    expanded.push({
      role: m.role,
      content: m.content,
      ...(m.images?.length ? { images: m.images } : {}),
      ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
    });
    for (const r of m.toolResults ?? []) {
      expanded.push({ role: "tool", toolName: r.toolName, content: r.content });
    }
  }
  return [{ role: "system", content: systemContent }, ...expanded];
}

function historyTurns(
  chatId: number,
  afterId: number,
  beforeId: number,
): TurnPayload[] {
  const rows = getTurnRowsForChat(chatId, afterId, beforeId);
  const turns: TurnPayload[] = rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    ...(imagesOf(r) ? { images: imagesOf(r) } : {}),
  }));
  return withToolResults(turns, rows);
}

const turnTokens = (t: TurnPayload): number =>
  estimateTokens(t.content) +
  (t.images?.length ?? 0) * IMAGE_TOKENS +
  (t.toolResults ?? []).reduce((n, r) => n + estimateTokens(r.content), 0);

/**
 * How big the request about to be sent is. The provider weighed everything up
 * to the last assistant turn; that turn's own reply and what followed are
 * estimated, since the measurement predates the reply.
 */
function projectedContextTokens(
  chatId: number,
  chat: { summary?: string | null; summary_upto?: number | null },
  turns: TurnPayload[],
): number {
  const measured = getMeasuredPrompt(chatId, chat.summary_upto ?? 0);
  const since = turns.filter(
    // `>=` keeps the measured turn's own reply in. The pending turn has no id.
    (t) => measured === null || t.id === undefined || t.id >= measured.id,
  );
  return projectContextTokens({
    measured: measured?.tokens ?? 0,
    estimated: since.reduce((n, t) => n + turnTokens(t), 0),
    fallback: estimateTokens(chat.summary ?? ""),
  });
}

export async function buildDaemonMessages(
  req: {
    chatId?: number;
    historyUpto?: number;
    messages: TurnPayload[];
  },
  rosterIndex: string,
  skillsIndex: string,
  contextLength: number,
): Promise<ConnectorChatMessage[] | null> {
  const chatId = req.chatId;
  if (chatId === undefined) return null;
  let chat = getChatById(chatId);
  if (!chat) return null;

  if (req.historyUpto !== undefined) deleteTurnsAfter(chatId, req.historyUpto);
  const collect = (summaryUpto: number | null | undefined): TurnPayload[] => {
    const turns = historyTurns(
      chatId,
      summaryUpto ?? 0,
      req.historyUpto ?? Number.MAX_SAFE_INTEGER,
    );
    const clientTurns = req.messages.filter((m) => m.role === "user");
    if (req.historyUpto !== undefined) {
      turns.push(...clientTurns.slice(-1));
    } else {
      const images = clientTurns[clientTurns.length - 1]?.images;
      const last = turns[turns.length - 1];
      if (last?.role === "user" && images?.length) last.images = images;
    }
    return turns;
  };

  let turns = collect(chat.summary_upto);
  if (
    projectedContextTokens(chatId, chat, turns) > usableTokens(contextLength) &&
    shouldAttemptCompact(chatId)
  ) {
    try {
      const summary = await compactChat(chatId);
      if (summary === null) {
        recordCompactFailure(chatId, "compact produced no summary");
      }
    } catch (err) {
      recordCompactFailure(
        chatId,
        err instanceof Error ? err.message : String(err),
      );
    }
    const compacted = getChatById(chatId);
    // Re-read, or this request carries the summary *and* what it replaced.
    if (compacted) {
      chat = compacted;
      turns = collect(chat.summary_upto);
    }
  }

  return buildContextMessages(chatId, turns, {
    rosterIndex,
    skillsIndex,
    summary: chat.summary ?? null,
  });
}
