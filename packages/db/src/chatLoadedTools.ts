import { getDb } from "./client.js";

export const rememberChatLoadedTools = (
  chatId: number,
  names: string[],
): void => {
  if (names.length === 0) return;
  const stmt = getDb().prepare(
    `INSERT INTO chat_loaded_tools (chat_id, tool_name)
     VALUES (?, ?)
     ON CONFLICT (chat_id, tool_name) DO UPDATE SET loaded_at = unixepoch()`,
  );
  const run = getDb().transaction((list: string[]) => {
    for (const name of list) stmt.run(chatId, name);
  });
  run(names);
};

export const getChatLoadedTools = (chatId: number): string[] =>
  (
    getDb()
      .prepare(
        `SELECT tool_name FROM chat_loaded_tools WHERE chat_id = ? ORDER BY loaded_at, rowid`,
      )
      .all(chatId) as { tool_name: string }[]
  ).map((r) => r.tool_name);
