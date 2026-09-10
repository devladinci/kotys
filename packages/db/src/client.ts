import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { TODO_SORT_STEP } from "@kotys/contracts";
import { DB_PATH } from "./config.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized");
  return db;
}

/**
 * Opens the database, applying schema and migrations. Idempotent.
 *
 * @param dbPath overrides the configured path — tests pass ":memory:".
 */
export function initDatabase(dbPath: string = DB_PATH): void {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(dbPath), 0o700);
    if (fs.existsSync(dbPath)) fs.chmodSync(dbPath, 0o600);
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.function("lower_uni", { deterministic: true }, (value: unknown) =>
    typeof value === "string" ? value.toLowerCase() : value,
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
     );

    -- Single source of truth for every model referenced by chats and messages.
    -- (provider, source, name) is the identity: the same name can exist as a
    -- cloud and a local listing with different context windows.
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'ollama',
      source TEXT NOT NULL CHECK(source IN ('cloud', 'local')),
      host TEXT,
      context_length INTEGER,
      capabilities TEXT,
      UNIQUE (provider, source, name)
     );

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      model_id INTEGER REFERENCES models(id),
      summary TEXT,
      summary_upto INTEGER,
      todo_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
     );

    CREATE INDEX IF NOT EXISTS idx_chats_todo ON chats(todo_id);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      images TEXT,
      model_id INTEGER REFERENCES models(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
     );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);

    CREATE TABLE IF NOT EXISTS tool_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      call_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (message_id, call_index),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tool_results_message ON tool_results(message_id, call_index);

    -- Per-chat record of MCP tools whose schemas were loaded into the tools
    -- array. Survives daemon restarts; rows die with the chat via cascade.
    CREATE TABLE IF NOT EXISTS chat_loaded_tools (
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      loaded_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (chat_id, tool_name)
    );

    -- One namespace of topic names shared by chats and memories. The join
    -- tables below carry the membership; the names live here exactly once.
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
     );

     -- Durable facts the model writes with the memory tools. source_chat_id is
     -- SET NULL rather than CASCADE: what was learned in a chat outlives it.
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('user', 'preference', 'project', 'fact')),
      source_chat_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (source_chat_id) REFERENCES chats(id) ON DELETE SET NULL
     );

    -- memory_topics: created canonical here on fresh databases; legacy shapes
    -- (free-text topic column) are rebuilt by the migration below.

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'archived')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      due_at INTEGER,
      notify_at INTEGER,
      notified INTEGER DEFAULT 0,
      completed_at INTEGER,
      created_by TEXT NOT NULL DEFAULT 'user' CHECK(created_by IN ('user', 'agent')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
     );

    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
    CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_at);
    CREATE INDEX IF NOT EXISTS idx_todos_notify ON todos(notify_at) WHERE notified = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_chat ON todos(chat_id);
    CREATE INDEX IF NOT EXISTS idx_todos_sort_order ON todos(sort_order);

    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      todo_id INTEGER,
      task TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 1500,
      break_seconds INTEGER NOT NULL DEFAULT 300,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ended_at INTEGER,
      completed_at INTEGER,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'paused', 'completed', 'cancelled')),
      phase TEXT NOT NULL DEFAULT 'focus',
      ends_at INTEGER,
      cycles INTEGER NOT NULL DEFAULT 1,
      cycles_completed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      remaining_at_pause INTEGER,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE SET NULL
     );

    CREATE INDEX IF NOT EXISTS idx_pomodoro_status ON pomodoro_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_pomodoro_started ON pomodoro_sessions(started_at);
   `);

  const pomodoroCols = new Set(
    (
      db.prepare("PRAGMA table_info(pomodoro_sessions)").all() as {
        name: string;
      }[]
    ).map((c) => c.name),
  );
  const dbInstance = db;
  const addPomodoroColumn = (name: string, ddl: string) => {
    if (!pomodoroCols.has(name)) {
      dbInstance.exec(`ALTER TABLE pomodoro_sessions ADD COLUMN ${ddl}`);
    }
  };
  addPomodoroColumn("updated_at", "updated_at INTEGER NOT NULL DEFAULT 0");
  addPomodoroColumn("remaining_at_pause", "remaining_at_pause INTEGER");
  addPomodoroColumn("phase", "phase TEXT NOT NULL DEFAULT 'focus'");
  addPomodoroColumn("ends_at", "ends_at INTEGER");

  const messageCols = db.prepare("PRAGMA table_info(messages)").all() as {
    name: string;
  }[];
  if (!messageCols.some((c) => c.name === "thinking")) {
    db.exec("ALTER TABLE messages ADD COLUMN thinking TEXT");
  }
  if (!messageCols.some((c) => c.name === "prompt_tokens")) {
    db.exec("ALTER TABLE messages ADD COLUMN prompt_tokens INTEGER");
    db.exec("ALTER TABLE messages ADD COLUMN eval_tokens INTEGER");
  }
  if (!messageCols.some((c) => c.name === "tool_calls")) {
    db.exec("ALTER TABLE messages ADD COLUMN tool_calls TEXT");
  }

  const chatsCols = db.prepare("PRAGMA table_info(chats)").all() as {
    name: string;
  }[];
  if (!chatColsHas(chatsCols, "model_id")) {
    db.exec(
      "ALTER TABLE chats ADD COLUMN model_id INTEGER REFERENCES models(id)",
    );
  }
  if (!chatColsHas(messageCols, "model_id")) {
    db.exec(
      "ALTER TABLE messages ADD COLUMN model_id INTEGER REFERENCES models(id)",
    );
  }
  if (!chatColsHas(chatsCols, "model_id")) {
    backfillModels(db);
  }

  for (const col of [
    "model",
    "model_context_length",
    "model_capabilities",
    "model_info",
  ]) {
    if (chatColsHas(chatsCols, col)) {
      db.exec(`ALTER TABLE chats DROP COLUMN ${col}`);
    }
  }
  if (chatColsHas(messageCols, "model")) {
    db.exec("ALTER TABLE messages DROP COLUMN model");
  }

  const chatsColsNow = db.prepare("PRAGMA table_info(chats)").all() as {
    name: string;
  }[];
  if (!chatColsHas(chatsColsNow, "summary")) {
    db.exec("ALTER TABLE chats ADD COLUMN summary TEXT");
    db.exec("ALTER TABLE chats ADD COLUMN summary_upto INTEGER");
  }
  if (!chatColsHas(chatsColsNow, "todo_id")) {
    db.exec("ALTER TABLE chats ADD COLUMN todo_id INTEGER");
    db.exec("CREATE INDEX IF NOT EXISTS idx_chats_todo ON chats(todo_id)");
  }

  const messageColsNow = db.prepare("PRAGMA table_info(messages)").all() as {
    name: string;
  }[];
  if (!chatColsHas(messageColsNow, "model_id")) {
    db.exec(
      "ALTER TABLE messages ADD COLUMN model_id INTEGER REFERENCES models(id)",
    );
  }

  const todoCols = db.prepare("PRAGMA table_info(todos)").all() as {
    name: string;
  }[];
  if (todoCols.length > 0 && !todoCols.some((c) => c.name === "created_by")) {
    db.exec(
      "ALTER TABLE todos ADD COLUMN created_by TEXT NOT NULL DEFAULT 'user'",
    );
  }
  if (todoCols.length > 0 && !todoCols.some((c) => c.name === "sort_order")) {
    db.exec(
      "ALTER TABLE todos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_todos_sort_order ON todos(sort_order)",
    );
  }
  if (todoCols.length > 0) {
    const { max } = db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max FROM todos")
      .get() as { max: number };
    if (max === 0) {
      const rows = db
        .prepare(
          "SELECT id FROM todos ORDER BY due_at IS NULL, due_at ASC, created_at DESC",
        )
        .all() as { id: number }[];
      const stmt = db.prepare("UPDATE todos SET sort_order = ? WHERE id = ?");
      db.transaction(() => {
        rows.forEach((r, i) => stmt.run((i + 1) * TODO_SORT_STEP, r.id));
      })();
    }
  }

  ensureTopicsSchema(db);

  const evalUsageRepaired = db
    .prepare("SELECT value FROM settings WHERE key = 'eval_usage_repaired'")
    .get() as { value: string } | undefined;
  if (!evalUsageRepaired) {
    db.exec(`
         UPDATE messages SET eval_tokens = NULL
            WHERE eval_tokens IS NOT NULL AND eval_tokens > 0;
         INSERT OR REPLACE INTO settings (key, value)
            VALUES ('eval_usage_repaired', '1');
      `);
  }

  const ftsVersion = db
    .prepare("SELECT value FROM settings WHERE key = 'fts_version'")
    .get() as { value: string } | undefined;
  if (ftsVersion?.value !== "3") {
    db.exec(`
      DROP TABLE IF EXISTS messages_fts;
      DROP TRIGGER IF EXISTS messages_fts_ai;
      DROP TRIGGER IF EXISTS messages_fts_ad;
      DROP TRIGGER IF EXISTS messages_fts_au;
      INSERT OR REPLACE INTO settings (key, value) VALUES ('fts_version', '3');
      `);
  }
  const fkCleanupVersion = db
    .prepare("SELECT value FROM settings WHERE key = 'fk_cleanup_version'")
    .get() as { value: string } | undefined;
  if (fkCleanupVersion?.value !== "1") {
    db.exec(`
      DELETE FROM messages WHERE chat_id NOT IN (SELECT id FROM chats);
      DELETE FROM chat_topics WHERE chat_id NOT IN (SELECT id FROM chats);
      DELETE FROM memory_topics WHERE memory_id NOT IN (SELECT id FROM memories);
      UPDATE memories SET source_chat_id = NULL
        WHERE source_chat_id IS NOT NULL
          AND source_chat_id NOT IN (SELECT id FROM chats);
      INSERT OR REPLACE INTO settings (key, value) VALUES ('fk_cleanup_version', '1');
      `);
  }

  db.exec("DROP TABLE IF EXISTS geocode_cache");
  db.exec("DROP TABLE IF EXISTS documents");

  runMigrations(db);
}

export const MIGRATIONS: ((db: Database.Database) => void)[] = [
  (db) => {
    db.exec("UPDATE todos SET due_at = due_at / 1000 WHERE due_at IS NOT NULL");
    db.exec(
      "UPDATE todos SET notify_at = notify_at / 1000 WHERE notify_at IS NOT NULL",
    );
  },
];

function runMigrations(db: Database.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

type ModelListingRow = {
  name: string;
  contextLength: number | null;
  capabilities: string[];
  source: "cloud" | "local";
  provider?: string;
  host?: string;
};

type Db = Database.Database;

const chatColsHas = (cols: { name: string }[], name: string): boolean =>
  cols.some((c) => c.name === name);

function upsertModelStmt(db: Db) {
  return db.prepare(`
    INSERT INTO models (name, provider, source, host, context_length, capabilities)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (provider, source, name) DO UPDATE SET
      host = excluded.host,
      context_length = excluded.context_length,
      capabilities = excluded.capabilities
    RETURNING id
    `);
}

function parseListing(json: string | null): ModelListingRow | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<ModelListingRow> | null;
    if (!parsed || typeof parsed.name !== "string") return null;
    return {
      name: parsed.name,
      contextLength:
        typeof parsed.contextLength === "number" ? parsed.contextLength : null,
      capabilities: Array.isArray(parsed.capabilities)
        ? (parsed.capabilities as string[])
        : [],
      source: parsed.source === "local" ? "local" : "cloud",
      provider:
        typeof parsed.provider === "string" ? parsed.provider : undefined,
      host: typeof parsed.host === "string" ? parsed.host : undefined,
    };
  } catch {
    return null;
  }
}

/** Runs only when legacy model columns exist; links chats and messages to models. */
function backfillModels(db: Db): void {
  const upsertModel = upsertModelStmt(db);
  const modelIdFor = (info: ModelListingRow): number =>
    (
      upsertModel.get(
        info.name,
        info.provider ?? "ollama",
        info.source,
        info.host ?? null,
        info.contextLength ?? null,
        JSON.stringify(info.capabilities),
      ) as { id: number }
    ).id;
  let listings: ModelListingRow[] = [];
  const modelsCache = db
    .prepare("SELECT value FROM settings WHERE key = 'models_cache'")
    .get() as { value: string } | undefined;
  if (modelsCache?.value) {
    try {
      listings = JSON.parse(modelsCache.value) as ModelListingRow[];
    } catch {
      listings = [];
    }
  }
  const listingByName = new Map(listings.map((m) => [m.name, m]));
  const setChatModelId = db.prepare(
    "UPDATE chats SET model_id = ? WHERE id = ?",
  );
  const infoById = new Map(
    (
      db.prepare("SELECT id, model_info FROM chats").all() as {
        id: number;
        model_info: string | null;
      }[]
    ).map((r) => [r.id, r.model_info] as const),
  );
  for (const row of db.prepare("SELECT id, model FROM chats").all() as {
    id: number;
    model: string;
  }[]) {
    if (!row.model) continue;
    const listing =
      parseListing(infoById.get(row.id) ?? null) ??
      listingByName.get(row.model);
    const info = listing ?? {
      name: row.model,
      contextLength: null,
      capabilities: [],
      source: "cloud" as const,
      provider: "ollama",
      host: "https://ollama.com",
    };
    setChatModelId.run(modelIdFor(info), row.id);
  }

  const setMsgModelId = db.prepare(
    "UPDATE messages SET model_id = ? WHERE id = ?",
  );
  const msgRows = db
    .prepare(
      "SELECT m.id, m.model, c.model_id AS chat_model_id FROM messages m LEFT JOIN chats c ON c.id = m.chat_id WHERE m.model IS NOT NULL",
    )
    .all() as {
    id: number;
    model: string;
    chat_model_id: number | null;
  }[];
  for (const row of msgRows) {
    const listing = listingByName.get(row.model);
    if (listing) {
      setMsgModelId.run(modelIdFor(listing), row.id);
    } else if (row.chat_model_id !== null) {
      setMsgModelId.run(row.chat_model_id, row.id);
    }
  }
}

/** Normalized topic name shared by the chat and memory topic join tables. */
function normalizeTopicName(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/^[-\d.)\s"']+/, "")
    .replace(/["'.:]+$/g, "")
    .slice(0, 40);
}

function upsertTopicRow(db: Db, raw: string): number | null {
  const name = normalizeTopicName(raw);
  if (!name) return null;
  db.prepare("INSERT OR IGNORE INTO topics (name) VALUES (?)").run(name);
  const row = db.prepare("SELECT id FROM topics WHERE name = ?").get(name) as {
    id: number;
  };
  return row.id;
}

/**
 * Brings both topic join tables to the (…_id pair, FKs, indexes) shape, all
 * three states: table absent (fresh database → create empty), legacy shape
 * (3-column chat_topics, free-text memory_topics → rebuild with migrated
 * data), or already current (no-op via the PRAGMA guard).
 */
function ensureTopicsSchema(db: Db): void {
  const createTable = (table: "chat_topics" | "memory_topics"): void => {
    const owner = table === "chat_topics" ? "chats" : "memories";
    db.exec(`
      CREATE TABLE ${table} (
        ${table === "chat_topics" ? "chat_id" : "memory_id"} INTEGER NOT NULL,
        topic_id INTEGER NOT NULL,
        PRIMARY KEY (${table === "chat_topics" ? "chat_id" : "memory_id"}, topic_id),
        FOREIGN KEY (${table === "chat_topics" ? "chat_id" : "memory_id"})
          REFERENCES ${owner}(id) ON DELETE CASCADE,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );
      CREATE INDEX idx_${table}_id ON ${table}(${table === "chat_topics" ? "chat_id" : "memory_id"});
      CREATE INDEX idx_${table}_topic_id ON ${table}(topic_id);
      `);
  };

  const legacyPairs = (
    table: "chat_topics" | "memory_topics",
  ): [number, number][] =>
    table === "chat_topics"
      ? (
          db
            .prepare("SELECT chat_id, topic1, topic2, topic3 FROM chat_topics")
            .all() as {
            chat_id: number;
            topic1: string | null;
            topic2: string | null;
            topic3: string | null;
          }[]
        ).flatMap((row) =>
          [row.topic1, row.topic2, row.topic3].flatMap((raw) => {
            const topicId = raw ? upsertTopicRow(db, raw) : null;
            return topicId !== null
              ? [[row.chat_id, topicId] as [number, number]]
              : [];
          }),
        )
      : (
          db.prepare("SELECT memory_id, topic FROM memory_topics").all() as {
            memory_id: number;
            topic: string;
          }[]
        ).flatMap((row) => {
          const topicId = upsertTopicRow(db, row.topic);
          return topicId !== null
            ? [[row.memory_id, topicId] as [number, number]]
            : [];
        });

  const migrateTable = (table: "chat_topics" | "memory_topics"): void => {
    const pairs = legacyPairs(table);
    db.exec(`DROP TABLE ${table}`);
    createTable(table);
    const insert = db.prepare(`INSERT OR IGNORE INTO ${table} VALUES (?, ?)`);
    db.transaction(() => {
      for (const pair of pairs) insert.run(...pair);
    })();
  };

  const colsOf = (table: string) =>
    db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (colsOf("chat_topics").some((c) => c.name === "topic1")) {
    migrateTable("chat_topics");
  } else if (colsOf("chat_topics").length === 0) {
    createTable("chat_topics");
  }
  if (colsOf("memory_topics").some((c) => c.name === "topic")) {
    migrateTable("memory_topics");
  } else if (colsOf("memory_topics").length === 0) {
    createTable("memory_topics");
  }
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}
