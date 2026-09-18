import { getDb } from "./client.js";
import { chatExists, escapeLike, makeSnippet } from "./internal.js";

// estimateTokens (chars / 4, rounded) per result, so the client's meter prices
// replayed tool output exactly as the server's replay budget does.
const TOOL_RESULT_TOKENS = `(SELECT SUM((LENGTH(tr.content) + 2) / 4)
         FROM tool_results tr WHERE tr.message_id = m.id) AS tool_result_tokens`;

// Secondary sort on id keeps user+assistant rows inserted in the same second
// (created_at has unixepoch granularity) in insertion order after a refetch.
export function getMessages(chatId: number): unknown[] {
  return getDb()
    .prepare(
      `SELECT m.*, mo.name AS model_name, ${TOOL_RESULT_TOKENS}
       FROM messages m LEFT JOIN models mo ON mo.id = m.model_id
       WHERE m.chat_id = ? ORDER BY m.created_at ASC, m.id ASC`,
    )
    .all(chatId);
}

export function getMessage(id: number): MessageRow | undefined {
  return getDb()
    .prepare(
      `SELECT m.*, mo.name AS model_name, ${TOOL_RESULT_TOKENS}
       FROM messages m LEFT JOIN models mo ON mo.id = m.model_id
       WHERE m.id = ?`,
    )
    .get(id) as MessageRow | undefined;
}

export type MessageRow = {
  id: number;
  chat_id: number;
  role: string;
  content: string;
  thinking: string | null;
  images: string | null;
  model_id: number | null;
  model_name: string | null;
  prompt_tokens: number | null;
  eval_tokens: number | null;
  tokens_measured: number | null;
  tool_calls: string | null;
  tool_result_tokens: number | null;
  created_at: number;
};

export type MessageUpdate = {
  content?: string;
  thinking?: string;
  promptTokens?: number;
  evalTokens?: number;
  tokensMeasured?: boolean;
  toolCalls?: string;
};

export type MessageSearchHit = {
  id: number;
  chat_id: number;
  role: string;
  title: string;
  snippet: string;
  created_at: number;
};

export type MessageSummaryRow = {
  id: number;
  role: string;
  content: string;
  created_at: number;
};

// Null means the chat is gone, so the message was dropped rather than written.
// Callers stop the send instead of streaming into a chat that no longer exists.
// An assistant row with no modelId inherits the chat's model: the reply was
// produced by whatever the chat is pointed at.
export function insertMessage(
  chatId: number,
  role: string,
  content: string,
  images?: string[],
  modelId?: number,
): number | null {
  if (!chatExists(chatId)) return null;
  const db = getDb();
  const resolved =
    modelId ??
    (role === "assistant"
      ? ((
          db.prepare("SELECT model_id FROM chats WHERE id = ?").get(chatId) as
            { model_id: number | null } | undefined
        )?.model_id ?? null)
      : null);
  const result = db
    .prepare(
      "INSERT INTO messages (chat_id, role, content, images, model_id) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      chatId,
      role,
      content,
      images ? JSON.stringify(images) : null,
      resolved,
    );
  db.prepare("UPDATE chats SET updated_at = unixepoch() WHERE id = ?").run(
    chatId,
  );
  return Number(result.lastInsertRowid);
}

/**
 * Partial write for streaming progress: callers pass only what changed and
 * untouched columns keep their value — an undefined must never become SQL
 * NULL (that would erase streamed text mid-turn).
 */
export function updateMessage(id: number, fields: MessageUpdate): void {
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (fields.content !== undefined) {
    sets.push("content = ?");
    values.push(fields.content);
  }
  if (fields.thinking !== undefined) {
    sets.push("thinking = ?");
    values.push(fields.thinking);
  }
  if (fields.promptTokens !== undefined) {
    sets.push("prompt_tokens = ?");
    values.push(fields.promptTokens);
  }
  if (fields.evalTokens !== undefined) {
    sets.push("eval_tokens = ?");
    values.push(fields.evalTokens);
  }
  if (fields.tokensMeasured !== undefined) {
    sets.push("tokens_measured = ?");
    values.push(fields.tokensMeasured ? 1 : 0);
  }
  if (fields.toolCalls !== undefined) {
    sets.push("tool_calls = ?");
    values.push(fields.toolCalls);
  }
  if (sets.length === 0) return;
  getDb()
    .prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values, id);
}

export function searchMessages(query: string): MessageSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 5);
  const where = tokens
    .map(() => `lower_uni(m.content) LIKE '%' || ? || '%' ESCAPE '\\'`)
    .join(" AND ");
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.chat_id, m.role, m.content, c.title, m.created_at
       FROM messages m
       JOIN chats c ON c.id = m.chat_id
       WHERE ${where}
       ORDER BY m.created_at DESC
       LIMIT 30`,
    )
    .all(...tokens.map(escapeLike)) as (MessageSummaryRow & {
    chat_id: number;
    title: string;
  })[];
  return rows.map((r) => ({
    id: r.id,
    chat_id: r.chat_id,
    role: r.role,
    title: r.title,
    snippet: makeSnippet(r.content, tokens[0]),
    created_at: r.created_at,
  }));
}

export function getMessageRowsForChat(
  chatId: number,
  limit: number,
  offset = 0,
): MessageSummaryRow[] {
  return getDb()
    .prepare(
      `SELECT id, role, content, created_at FROM messages
       WHERE chat_id = ? AND role IN ('user', 'assistant')
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(chatId, limit, offset) as MessageSummaryRow[];
}

export function getChatIdForMessage(messageId: number): number | null {
  const row = getDb()
    .prepare("SELECT chat_id FROM messages WHERE id = ?")
    .get(messageId) as { chat_id: number } | undefined;
  return row?.chat_id ?? null;
}

export function deleteTurnsAfter(
  chatId: number,
  afterId: number,
  keepId: number,
): void {
  getDb()
    .prepare("DELETE FROM messages WHERE chat_id = ? AND id > ? AND id <> ?")
    .run(chatId, afterId, keepId);
}

/**
 * Reset an assistant row so a retry starts clean: streamed text, thinking,
 * tool-call trace and the replayable tool results all go. Keeps the row
 * itself (and its id, which clients may already reference as streamingId).
 */
export function resetAssistantMessage(id: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `UPDATE messages SET content = '', thinking = NULL, tool_calls = NULL,
       prompt_tokens = NULL, eval_tokens = NULL, tokens_measured = NULL
       WHERE id = ? AND role = 'assistant'`,
    ).run(id);
    db.prepare("DELETE FROM tool_results WHERE message_id = ?").run(id);
  })();
}
