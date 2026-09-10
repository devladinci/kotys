import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as db from "./index.js";
import { MIGRATIONS } from "./client.js";
import fs from "node:fs";

// /tmp, not os.tmpdir(): macOS resolves it to /var/folders, which sits on
// the sensitive-path denylist.
const dir = "/tmp/kotys-migrations-test";

const raw = () => new Database(`${dir}/seed.db`);

const seedLegacyTodos = () => {
  const d = raw();
  d.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      due_at INTEGER,
      notify_at INTEGER,
      notified INTEGER DEFAULT 0,
      completed_at INTEGER,
      created_by TEXT NOT NULL DEFAULT 'user',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  // due_at/notify_at as the old JS milliseconds.
  d.prepare(
    "INSERT INTO todos (title, due_at, notify_at) VALUES (?, ?, ?)",
  ).run("legacy", 1_789_135_080_000, 1_789_135_080_000);
  // An untouched seconds column must not be divided.
  d.prepare("UPDATE todos SET created_at = 1_789_135_080").run();
  d.close();
};

describe("numbered migrations", () => {
  it("head schema has every migrated table and column", () => {
    const d = db.getDb();
    const tables = d
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain("chat_loaded_tools");
    expect(tables).toContain("tool_results");
    const todoCols = d.prepare("PRAGMA table_info(todos)").all() as {
      name: string;
    }[];
    expect(todoCols.map((c) => c.name)).toContain("due_at");
    expect(d.pragma("user_version", { simple: true }) as number).toBe(
      MIGRATIONS.length,
    );
  });
  beforeEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    seedLegacyTodos();
    db.initDatabase(`${dir}/seed.db`);
  });

  afterEach(() => {
    db.closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("migrates millisecond todo dates to seconds exactly once", () => {
    const row = db
      .getDb()
      .prepare("SELECT due_at, notify_at, created_at FROM todos")
      .get() as { due_at: number; notify_at: number; created_at: number };
    expect(row.due_at).toBe(1_789_135_080);
    expect(row.notify_at).toBe(1_789_135_080);
    expect(row.created_at).toBe(1_789_135_080);
    expect(
      db.getDb().pragma("user_version", { simple: true }) as number,
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not re-divide on reopen", () => {
    db.closeDatabase();
    db.initDatabase(`${dir}/seed.db`);
    const row = db.getDb().prepare("SELECT due_at FROM todos").get() as {
      due_at: number;
    };
    expect(row.due_at).toBe(1_789_135_080);
  });
});
