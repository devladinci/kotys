import type { ModelListing } from "@kotys/contracts";
import { getDb } from "./client.js";
import { chatExists } from "./internal.js";

/**
 * The models table is the single source of truth: chats and messages point at
 * a row here instead of each carrying their own copy of the listing. The
 * (provider, source, name) triple is the identity — the same name can exist
 * as a cloud and a local listing with different context windows.
 */
export function upsertModel(model: ModelListing): number {
  const row = getDb()
    .prepare(
      `INSERT INTO models (name, provider, source, host, context_length, capabilities)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, source, name) DO UPDATE SET
         host = excluded.host,
         context_length = excluded.context_length,
         capabilities = excluded.capabilities
       RETURNING id`,
    )
    .get(
      model.name,
      model.provider ?? "ollama",
      model.source,
      model.host ?? null,
      model.contextLength ?? null,
      JSON.stringify(model.capabilities),
    ) as { id: number };
  return row.id;
}

export function getModelById(id: number): ModelListing | null {
  const row = getDb()
    .prepare(
      "SELECT name, provider, source, host, context_length, capabilities FROM models WHERE id = ?",
    )
    .get(id) as
    | {
        name: string;
        provider: string;
        source: "cloud" | "local";
        host: string | null;
        context_length: number | null;
        capabilities: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    name: row.name,
    provider: row.provider,
    source: row.source,
    ...(row.host ? { host: row.host } : {}),
    contextLength: row.context_length,
    capabilities: row.capabilities
      ? (JSON.parse(row.capabilities) as string[])
      : [],
  };
}

export function createChat(title: string, model: ModelListing) {
  const modelId = upsertModel(model);
  const result = getDb()
    .prepare("INSERT INTO chats (title, model_id) VALUES (?, ?)")
    .run(title, modelId);
  return result.lastInsertRowid;
}
export function renameChat(id: number, title: string) {
  getDb()
    .prepare(
      "UPDATE chats SET title = ?, updated_at = unixepoch() WHERE id = ?",
    )
    .run(title, id);
}
export function deleteChat(id: number) {
  getDb().prepare("DELETE FROM chats WHERE id = ?").run(id);
}
export function setChatSummary(chatId: number, summary: string, upto: number) {
  getDb()
    .prepare("UPDATE chats SET summary = ?, summary_upto = ? WHERE id = ?")
    .run(summary, upto, chatId);
}

export function setChatModel(id: number, model: ModelListing) {
  if (!chatExists(id)) return;
  getDb()
    .prepare(
      "UPDATE chats SET model_id = ?, updated_at = unixepoch() WHERE id = ?",
    )
    .run(upsertModel(model), id);
}

/**
 * Bring stored models in line with a fresh listing, so a window that moved
 * provider-side reaches existing chats without re-picking the model.
 *
 * Update-only: rows exist because a chat points at one. Coalesced: both
 * connectors fall back to a thinner endpoint on failure, and writing that
 * through would strip thinking and vision from a working chat.
 */
export function refreshModels(models: ModelListing[]) {
  const db = getDb();
  const update = db.prepare(
    `UPDATE models SET
       host = COALESCE(?, host),
       context_length = COALESCE(?, context_length),
       capabilities = COALESCE(?, capabilities)
     WHERE provider = ? AND source = ? AND name = ?`,
  );
  db.transaction((listings: ModelListing[]) => {
    for (const model of listings) {
      update.run(
        model.host ?? null,
        model.contextLength ?? null,
        model.capabilities?.length ? JSON.stringify(model.capabilities) : null,
        model.provider ?? "ollama",
        model.source,
        model.name,
      );
    }
  })(models);
}

export function setChatTopics(chatId: number, topics: string[]) {
  if (!chatExists(chatId)) return;
  const db = getDb();
  db.prepare("DELETE FROM chat_topics WHERE chat_id = ?").run(chatId);
  const insertTopic = db.prepare(
    "INSERT OR IGNORE INTO topics (name) VALUES (?)",
  );
  const getTopic = db.prepare("SELECT id FROM topics WHERE name = ?");
  const link = db.prepare(
    "INSERT OR IGNORE INTO chat_topics (chat_id, topic_id) VALUES (?, ?)",
  );
  db.transaction(() => {
    for (const raw of topics) {
      const name = raw.trim().toLowerCase().slice(0, 40);
      if (!name) continue;
      insertTopic.run(name);
      const row = getTopic.get(name) as { id: number } | undefined;
      if (row) link.run(chatId, row.id);
    }
  })();
}
type ChatRow = {
  id: number;
  title: string;
  model_id: number | null;
  summary: string | null;
  summary_upto: number | null;
  created_at: number;
  updated_at: number;
};

const CHAT_SELECT = `
  SELECT c.id, c.title, c.model_id, c.summary, c.summary_upto,
         c.created_at, c.updated_at,
         m.name AS model_name, m.provider AS model_provider,
         m.source AS model_source, m.host AS model_host,
         m.context_length AS model_context_length,
         m.capabilities AS model_capabilities,
         (SELECT group_concat(t.name, char(30)) FROM chat_topics ct
          JOIN topics t ON t.id = ct.topic_id WHERE ct.chat_id = c.id) AS topics_blob
  FROM chats c
  LEFT JOIN models m ON m.id = c.model_id`;

function topicsOf(blob: string | null): string[] {
  // char(30) (record separator) cannot appear in a normalized topic name.
  return blob ? (blob.split("\u001e") as string[]).filter(Boolean) : [];
}

export function listChatsWithTopics() {
  return getDb()
    .prepare(`${CHAT_SELECT} ORDER BY c.updated_at DESC`)
    .all() as (ChatRow & {
    model_name: string | null;
    model_provider: string | null;
    model_source: "cloud" | "local" | null;
    model_host: string | null;
    model_context_length: number | null;
    model_capabilities: string | null;
    topics_blob: string | null;
  })[];
}

export function createSubagentChat(
  parentChatId: number,
  title: string,
  model: ModelListing,
): number {
  const modelId = upsertModel(model);
  const result = getDb()
    .prepare("INSERT INTO chats (title, parent_id, model_id) VALUES (?, ?, ?)")
    .run(title, parentChatId, modelId);
  return Number(result.lastInsertRowid);
}

export function getSubagentChat(parentChatId: number, agentName: string) {
  const row = getDb()
    .prepare(
      `SELECT c.id FROM chats c
       WHERE c.parent_id = ? AND c.title = ?
       ORDER BY c.updated_at DESC LIMIT 1`,
    )
    .get(parentChatId, `subagent:${agentName}`) as { id: number } | undefined;
  return row?.id ?? null;
}

export function getChatById(id: number) {
  const row = getDb().prepare(`${CHAT_SELECT} WHERE c.id = ?`).get(id) as
    | (ChatRow & {
        model_name: string | null;
        model_provider: string | null;
        model_source: "cloud" | "local" | null;
        model_host: string | null;
        model_context_length: number | null;
        model_capabilities: string | null;
        topics_blob: string | null;
      })
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    model: row.model_name ?? "",
    model_provider: row.model_provider,
    model_source: row.model_source,
    model_context_length: row.model_context_length,
    topics: topicsOf(row.topics_blob),
    summary: row.summary ?? null,
    summary_upto: row.summary_upto ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
export function getChatByTodoId(todoId: number): number | null {
  const row = getDb()
    .prepare("SELECT id FROM chats WHERE todo_id = ?")
    .get(todoId) as { id: number } | undefined;
  return row?.id ?? null;
}
export function createChatForTodo(
  todoId: number,
  title: string,
  model: ModelListing,
): number {
  const modelId = upsertModel(model);
  const result = getDb()
    .prepare("INSERT INTO chats (title, todo_id, model_id) VALUES (?, ?, ?)")
    .run(title, todoId, modelId);
  return Number(result.lastInsertRowid);
}
export function getChatMessageCount(chatId: number): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM messages WHERE chat_id = ?")
    .get(chatId) as { count: number };
  return row.count;
}

export function getChatTopics(chatId: number) {
  const row = getDb()
    .prepare(
      `SELECT group_concat(t.name, char(30)) AS names
       FROM chat_topics ct JOIN topics t ON t.id = ct.topic_id
       WHERE ct.chat_id = ?`,
    )
    .get(chatId) as { names: string | null } | undefined;
  return topicsOf(row?.names ?? null);
}
export function setChatSummaryUpto(chatId: number, upto: number) {
  getDb()
    .prepare("UPDATE chats SET summary_upto = ? WHERE id = ?")
    .run(upto, chatId);
}
