import { getDb } from "./client.js";

export type ToolResultRow = {
  message_id: number;
  call_index: number;
  content: string;
};

export function insertToolResults(
  messageId: number,
  results: { callIndex: number; content: string }[],
): void {
  if (results.length === 0) return;
  const db = getDb();
  db.transaction(() => {
    for (const r of results) {
      db.prepare(
        `INSERT OR REPLACE INTO tool_results (message_id, call_index, content)
         VALUES (?, ?, ?)`,
      ).run(messageId, r.callIndex, r.content);
    }
  })();
}

export function getToolResultsForMessages(
  messageIds: number[],
): ToolResultRow[] {
  if (messageIds.length === 0) return [];
  const placeholders = messageIds.map(() => "?").join(", ");
  return getDb()
    .prepare(
      `SELECT message_id, call_index, content FROM tool_results
       WHERE message_id IN (${placeholders})
       ORDER BY message_id ASC, call_index ASC`,
    )
    .all(...messageIds) as ToolResultRow[];
}
