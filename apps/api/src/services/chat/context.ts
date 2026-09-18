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
  replayedToolMessages,
  usableTokens,
} from "@kotys/contracts";
import { compactChat } from "./compact.js";
import {
  recordCompactFailure,
  shouldAttemptCompact,
} from "./context-budget.js";
import type { ConnectorChatMessage } from "../llm/registry.js";
import type { ToolResultRow, TurnRow } from "@kotys/db";
import { parseTrace, splitReplyAtSteers } from "./steers.js";

type TurnPayload = {
  /** Absent on the pending client turn, which is always the newest. */
  id?: number;
  role: string;
  content: string;
  images?: string[];
  toolCalls?: {
    id?: string;
    function: { name: string; arguments: Record<string, unknown> };
  }[];
  toolResults?: { toolName: string; content: string }[];
};

// Results match the trace by call_index: steer entries take trace slots but
// never have a result.
function replayAssistant(
  turn: TurnPayload,
  row: TurnRow,
  results: ToolResultRow[],
): TurnPayload[] {
  const trace = parseTrace(row.tool_calls);
  const withCalls = (t: TurnPayload, calls: ToolResultRow[]): TurnPayload => {
    if (calls.length === 0) return t;
    const named = calls.map((r) => ({
      id: `replay_${row.id}_${r.call_index}`,
      name: trace[r.call_index]?.tool ?? `tool_${r.call_index}`,
      content: r.content,
    }));
    return {
      ...t,
      toolCalls: named.map((n) => ({
        id: n.id,
        function: { name: n.name, arguments: {} },
      })),
      toolResults: named.map((n) => ({ toolName: n.name, content: n.content })),
    };
  };
  const parts = splitReplyAtSteers(turn.content, trace);
  if (parts.length === 1) return [withCalls(turn, results)];
  return parts.flatMap((part): TurnPayload[] => {
    if (part.kind === "steer") {
      return [{ id: turn.id, role: "user", content: part.text }];
    }
    const content = part.text.trim();
    const calls = results.filter(
      (r) => r.call_index > part.afterCall && r.call_index < part.beforeCall,
    );
    if (!content && calls.length === 0) return [];
    return [withCalls({ id: turn.id, role: turn.role, content }, calls)];
  });
}

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
  const budgeted = replayedToolMessages(
    [...byMessage].map(([id, rows_]) => ({
      id,
      tokens: rows_.reduce((n, r) => n + estimateTokens(r.content), 0),
    })),
  );

  return turns.flatMap((t, i) => {
    const row = rows[i];
    if (row?.role !== "assistant") return [t];
    // Over-budget turns replay without tool traffic, but keep their steers.
    const results = budgeted.has(row.id) ? (byMessage.get(row.id) ?? []) : [];
    return replayAssistant(t, row, results);
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

function projectedContextTokens(
  chatId: number,
  chat: { summary?: string | null; summary_upto?: number | null },
  turns: TurnPayload[],
): number {
  const measured = getMeasuredPrompt(chatId, chat.summary_upto ?? 0);
  const since = turns.filter(
    // `>=`: the measurement predates the measured turn's own reply.
    (t) => measured === null || t.id === undefined || t.id >= measured.id,
  );
  return projectContextTokens({
    measured: measured?.tokens ?? 0,
    estimated: since.reduce((n, t) => n + turnTokens(t), 0),
    fallback: estimateTokens(chat.summary ?? ""),
  });
}

type DaemonRequest = {
  requestId: number;
  chatId?: number;
  historyUpto?: number;
  messages: TurnPayload[];
};

export async function buildDaemonMessages(
  req: DaemonRequest,
  rosterIndex: string,
  skillsIndex: string,
  contextLength: number,
): Promise<ConnectorChatMessage[] | null> {
  const chatId = req.chatId;
  if (chatId === undefined) return null;
  let chat = getChatById(chatId);
  if (!chat) return null;

  // The client inserts the new reply row before streaming, so it must survive.
  if (req.historyUpto !== undefined) {
    deleteTurnsAfter(chatId, req.historyUpto, req.requestId);
  }
  const collect = (summaryUpto: number | null): TurnPayload[] => {
    const turns = historyTurns(
      chatId,
      summaryUpto ?? 0,
      req.historyUpto ?? Number.MAX_SAFE_INTEGER,
    );
    const clientTurns = req.messages.filter((m) => m.role === "user");
    if (req.historyUpto !== undefined) {
      turns.push(...clientTurns.slice(-1));
      return turns;
    }
    const images = clientTurns[clientTurns.length - 1]?.images;
    const last = turns[turns.length - 1];
    if (last?.role === "user" && images?.length) last.images = images;
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
    // Re-read, or this request carries the summary *and* what it replaced.
    const compacted = getChatById(chatId);
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
