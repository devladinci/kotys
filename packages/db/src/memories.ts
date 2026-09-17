import type { MemoryType, MemoryRecord } from "@kotys/contracts";
import { getDb } from "./client.js";
import { getChatTopics } from "./chats.js";
import { chatExists, escapeLike } from "./internal.js";

type MemoryBase = Omit<MemoryRecord, "topics">;
const MEMORY_COLS = `m.id, m.key, m.content, m.type, m.source_chat_id,
         c.title AS source_chat_title, m.created_at, m.updated_at,
         m.use_count, m.last_used_at`;
// LEFT JOIN, not INNER: a memory whose source chat was deleted still shows,
// with a null title.
const MEMORY_FROM = `FROM memories m LEFT JOIN chats c ON c.id = m.source_chat_id`;
const ALWAYS_ON_SQL = `m.type IN ('user', 'preference')`;
export function normalizeMemoryKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
export function normalizeTopic(topic: string) {
  return topic.trim().toLowerCase().slice(0, 40);
}
function attachTopics(rows: MemoryBase[]): MemoryRecord[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const topicRows = getDb()
    .prepare(
      `SELECT mt.memory_id, t.name FROM memory_topics mt
       JOIN topics t ON t.id = mt.topic_id
       WHERE mt.memory_id IN (${ids.map(() => "?").join(",")})
       ORDER BY t.name`,
    )
    .all(...ids) as { memory_id: number; name: string }[];
  const byId = new Map<number, string[]>();
  for (const row of topicRows) {
    const list = byId.get(row.memory_id);
    if (list) list.push(row.name);
    else byId.set(row.memory_id, [row.name]);
  }
  return rows.map((r) => ({ ...r, topics: byId.get(r.id) ?? [] }));
}

function touchUsage(ids: number[]) {
  if (ids.length === 0) return;
  getDb()
    .prepare(
      `UPDATE memories
       SET use_count = use_count + 1, last_used_at = unixepoch()
       WHERE id IN (${ids.map(() => "?").join(",")})`,
    )
    .run(...ids);
}

/** Shared write path for the topic namespace: every writer normalizes here. */
export function upsertTopicIds(topics: string[]): number[] {
  const db = getDb();
  const insert = db.prepare("INSERT OR IGNORE INTO topics (name) VALUES (?)");
  const get = db.prepare("SELECT id FROM topics WHERE name = ?");
  const ids: number[] = [];
  for (const raw of topics) {
    const name = normalizeTopic(raw);
    if (!name) continue;
    insert.run(name);
    const row = get.get(name) as { id: number } | undefined;
    if (row) ids.push(row.id);
  }
  return ids;
}

function writeTopics(memoryId: number, topics: string[]) {
  const db = getDb();
  db.prepare("DELETE FROM memory_topics WHERE memory_id = ?").run(memoryId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO memory_topics (memory_id, topic_id) VALUES (?, ?)",
  );
  db.transaction(() => {
    for (const topicId of upsertTopicIds(topics)) insert.run(memoryId, topicId);
  })();
}
export function getMemoryById(id: number): MemoryRecord | null {
  const row = getDb()
    .prepare(`SELECT ${MEMORY_COLS} ${MEMORY_FROM} WHERE m.id = ?`)
    .get(id) as MemoryBase | undefined;
  return row ? attachTopics([row])[0] : null;
}

export function getMemoryByKey(key: string): MemoryRecord | null {
  const row = getDb()
    .prepare(`SELECT ${MEMORY_COLS} ${MEMORY_FROM} WHERE m.key = ?`)
    .get(normalizeMemoryKey(key)) as MemoryBase | undefined;
  return row ? attachTopics([row])[0] : null;
}
export function createMemory(input: {
  key: string;
  content: string;
  type: MemoryType;
  topics: string[];
  sourceChatId: number | null;
}): MemoryRecord {
  // A chat deleted while the tool call was in flight degrades to null instead
  // of failing the write: source_chat_id is SET NULL by design, so a memory
  // whose chat is already gone is the same case, just reached a moment earlier.
  const sourceChatId =
    input.sourceChatId !== null && chatExists(input.sourceChatId)
      ? input.sourceChatId
      : null;
  const result = getDb()
    .prepare(
      "INSERT INTO memories (key, content, type, source_chat_id) VALUES (?, ?, ?, ?)",
    )
    .run(
      normalizeMemoryKey(input.key),
      input.content.trim(),
      input.type,
      sourceChatId,
    );
  const id = Number(result.lastInsertRowid);
  writeTopics(id, input.topics);
  return getMemoryById(id) as MemoryRecord;
}
export function updateMemory(
  id: number,
  fields: { content?: string; type?: MemoryType; topics?: string[] },
): MemoryRecord | null {
  if (!getMemoryById(id)) return null;
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (fields.content !== undefined) {
    sets.push("content = ?");
    values.push(fields.content.trim());
  }
  if (fields.type !== undefined) {
    sets.push("type = ?");
    values.push(fields.type);
  }
  if (sets.length > 0) {
    getDb()
      .prepare(
        `UPDATE memories SET ${sets.join(", ")}, updated_at = unixepoch() WHERE id = ?`,
      )
      .run(...values, id);
  }
  if (fields.topics !== undefined) {
    writeTopics(id, fields.topics);
    getDb()
      .prepare("UPDATE memories SET updated_at = unixepoch() WHERE id = ?")
      .run(id);
  }
  return getMemoryById(id);
}
export function deleteMemory(id: number): MemoryRecord | null {
  const existing = getMemoryById(id);
  if (!existing) return null;
  getDb().prepare("DELETE FROM memories WHERE id = ?").run(id);
  return existing;
}
export function listMemories(): MemoryRecord[] {
  const rows = getDb()
    .prepare(`SELECT ${MEMORY_COLS} ${MEMORY_FROM} ORDER BY m.updated_at DESC`)
    .all() as MemoryBase[];
  return attachTopics(rows);
}
export function searchMemories(opts: {
  query?: string;
  topic?: string;
  type?: MemoryType;
  limit?: number;
}): MemoryRecord[] {
  const where: string[] = [];
  const values: (string | number)[] = [];
  const query = opts.query?.trim().toLowerCase();
  if (query) {
    where.push(
      `(lower_uni(m.content) LIKE '%' || ? || '%' ESCAPE '\\'
        OR m.key LIKE '%' || ? || '%' ESCAPE '\\')`,
    );
    values.push(escapeLike(query), escapeLike(query));
  }
  const topic = opts.topic ? normalizeTopic(opts.topic) : "";
  if (topic) {
    where.push(
      `EXISTS (SELECT 1 FROM memory_topics mt
               JOIN topics t ON t.id = mt.topic_id
               WHERE mt.memory_id = m.id
                 AND t.name LIKE '%' || ? || '%' ESCAPE '\\')`,
    );
    values.push(escapeLike(topic));
  }
  if (opts.type) {
    where.push("m.type = ?");
    values.push(opts.type);
  }
  const rows = getDb()
    .prepare(
      `SELECT ${MEMORY_COLS} ${MEMORY_FROM}
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY m.updated_at DESC
       LIMIT ?`,
    )
    .all(...values, opts.limit ?? 30) as MemoryBase[];
  touchUsage(rows.map((r) => r.id));
  return attachTopics(rows);
}
export function getMemoriesForChat(
  chatId: number | null,
  limit = 20,
): MemoryRecord[] {
  const topics = (chatId ? getChatTopics(chatId) : [])
    .map(normalizeTopic)
    .filter(Boolean);
  const topicClause =
    topics.length > 0
      ? ` OR EXISTS (SELECT 1 FROM memory_topics mt
                     JOIN topics t ON t.id = mt.topic_id
                     WHERE mt.memory_id = m.id
                       AND t.name IN (${topics.map(() => "?").join(",")}))`
      : "";
  const rows = getDb()
    .prepare(
      `SELECT ${MEMORY_COLS} ${MEMORY_FROM}
       WHERE ${ALWAYS_ON_SQL}${topicClause}
       ORDER BY CASE WHEN ${ALWAYS_ON_SQL} THEN 0 ELSE 1 END,
                m.use_count DESC, m.updated_at DESC
       LIMIT ?`,
    )
    .all(...topics, limit) as MemoryBase[];
  touchUsage(rows.map((r) => r.id));
  return attachTopics(rows);
}
