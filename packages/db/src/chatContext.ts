import { getDb } from "./client.js";

export type TurnRow = {
  id: number;
  role: "user" | "assistant";
  content: string;
  images: string | null;
  tool_calls: string | null;
};

export function getTurnRowsForChat(
  chatId: number,
  afterId = 0,
  beforeId = Number.MAX_SAFE_INTEGER,
): TurnRow[] {
  return getDb()
    .prepare(
      `SELECT id, role, content, images, tool_calls FROM messages
       WHERE chat_id = ? AND role IN ('user', 'assistant')
         AND id > ? AND id < ? AND content <> ''
       ORDER BY id ASC`,
    )
    .all(chatId, afterId, beforeId) as TurnRow[];
}

/**
 * The provider's own prompt size for the newest assistant turn after `afterId`,
 * the summary boundary — a turn measured before it was billed for messages the
 * summary has since replaced. An errored or tool-only turn still counts.
 */
export function getMeasuredPrompt(
  chatId: number,
  afterId = 0,
): { id: number; tokens: number } | null {
  const row = getDb()
    .prepare(
      `SELECT id, prompt_tokens FROM messages
       WHERE chat_id = ? AND role = 'assistant'
         AND id > ? AND prompt_tokens > 0
       ORDER BY id DESC LIMIT 1`,
    )
    .get(chatId, afterId) as { id: number; prompt_tokens: number } | undefined;
  return row ? { id: row.id, tokens: row.prompt_tokens } : null;
}

export function imagesOf(row: Pick<TurnRow, "images">): string[] | undefined {
  if (!row.images) return undefined;
  try {
    const parsed = JSON.parse(row.images) as unknown;
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed as string[])
      : undefined;
  } catch {
    return undefined;
  }
}
