import {
  DEFAULT_CONTEXT,
  KEEP_TOKENS,
  SUMMARY_MAX_TOKENS,
  estimateTokens,
} from "@kotys/contracts";
import {
  getChatById,
  getTurnRowsForChat,
  getToolResultsForMessages,
  imagesOf,
  setChatSummary,
} from "@kotys/db";
import {
  resolveConnector,
  resolveOllamaConnector,
  type ConnectorChatMessage,
} from "../llm/registry.js";

const SUMMARY_TEMPLATE = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Topic
- [one or two brief sentences describing what the conversation is about]

## Important Details
- [facts, constraints, preferences, decisions and why, or "(none)"]

## Current State
- [what has been discussed or resolved so far, or "(none)"]

## Open Threads
- [unanswered questions or things the user still wants, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact names, numbers, code identifiers, and URLs when known.
- Respond in the same language as the conversation.
- Do not mention the summary process or that context was compacted.`;

const buildSummaryPrompt = (history: string, previousSummary?: string) =>
  [
    previousSummary
      ? `Update the anchored summary below using the conversation history that follows. Preserve still-true details, remove stale details, and merge in the new facts.\n<previous-summary>\n${previousSummary}\n</previous-summary>`
      : "Create an anchored summary of the conversation history that follows.",
    SUMMARY_TEMPLATE,
    history,
  ].join("\n\n");

/** Tool output under each assistant turn, capped so one huge result cannot eat the summary prompt. */
const TOOL_SUMMARY_CHARS = 4_000;

const summarizeToolResults = (messageId: number): string => {
  const rows = getToolResultsForMessages([messageId]);
  if (rows.length === 0) return "";
  const text = rows
    .map((r) => r.content)
    .join("\n---\n")
    .trim();
  if (text.length <= TOOL_SUMMARY_CHARS) return text;
  return `${text.slice(0, TOOL_SUMMARY_CHARS)}\n…(truncated)`;
};

type Candidate = {
  id: number;
  role: string;
  content: string;
  images: string | null;
};

export function selectSummaryHead(
  candidates: Candidate[],
  keepBudget: number,
): Candidate[] {
  if (keepBudget <= 0) return candidates;
  let keepFrom = candidates.length;
  let kept = 0;
  for (let i = candidates.length - 1; i >= 0; i--) {
    kept += estimateTokens(candidates[i].content);
    if (kept > keepBudget && candidates.length - i >= 2) break;
    keepFrom = i;
  }
  return candidates.slice(0, keepFrom);
}

export async function compactChat(
  chatId: number,
  opts?: { force?: boolean },
): Promise<{ summary: string; upto: number } | null> {
  const chat = getChatById(chatId);
  if (!chat) return null;
  const rows = getTurnRowsForChat(
    chatId,
    chat.summary_upto ?? 0,
    Number.MAX_SAFE_INTEGER,
  );
  const candidates = rows.filter((r) => r.content.trim().length > 0);
  const ctx = chat.model_context_length ?? DEFAULT_CONTEXT;
  const summaryTokens = Math.min(SUMMARY_MAX_TOKENS, Math.floor(ctx / 4));
  const keepBudget = opts?.force
    ? 0
    : Math.min(KEEP_TOKENS, Math.floor(ctx / 4));
  const head = selectSummaryHead(candidates, keepBudget);
  if (head.length === 0) return null;

  let history = head
    .map((r) => {
      const label = r.role === "user" ? "User" : "Assistant";
      const imagePrefix = imagesOf(r)?.length ? "[image attached] " : "";
      const toolText = summarizeToolResults(r.id);
      const body = toolText
        ? `${r.content}\n\nTool output:\n${toolText}`
        : r.content;
      return `[${label}]: ${imagePrefix}${body}`;
    })
    .join("\n\n");
  const maxHistoryChars = Math.max(2000, (ctx - summaryTokens - 500) * 4);
  if (history.length > maxHistoryChars)
    history = history.slice(-maxHistoryChars);

  const messages: ConnectorChatMessage[] = [
    {
      role: "user",
      content: buildSummaryPrompt(history, chat.summary ?? undefined),
    },
  ];
  const req = {
    model: chat.model,
    messages,
    temperature: 0,
    seed: 42,
    maxTokens: summaryTokens,
    think: false as const,
  };
  const connector =
    chat.model_provider && chat.model_provider !== "ollama"
      ? resolveConnector({ provider: chat.model_provider, model: chat.model })
      : resolveOllamaConnector(
          chat.model_source === "local" ? "local" : "cloud",
        );
  const response = await connector.chat(req);
  if (!response.content) return null;
  const upto = head[head.length - 1].id;
  setChatSummary(chatId, response.content, upto);
  return { summary: response.content, upto };
}
