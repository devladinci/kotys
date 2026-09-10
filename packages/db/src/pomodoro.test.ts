import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, beforeAll } from "vitest";

// The Pomodoro table shipped once without `phase` or `ends_at`. This suite runs
// initDatabase over a database in that older shape to prove the catch-up
// ALTERs land and, more importantly, that nothing already in the table is lost:
// the local chat.db is the only copy there is.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pomo-migrate-"));

const dbPath = path.join(tmpRoot, "chat.db");

beforeAll(async () => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const seed = new Database(dbPath);
  seed.exec(`
    CREATE TABLE pomodoro_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      todo_id INTEGER,
      task TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 1500,
      break_seconds INTEGER NOT NULL DEFAULT 300,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ended_at INTEGER,
      completed_at INTEGER,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','completed','cancelled')),
      cycles INTEGER NOT NULL DEFAULT 1,
      cycles_completed INTEGER NOT NULL DEFAULT 0
    );
    ALTER TABLE pomodoro_sessions ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE pomodoro_sessions ADD COLUMN remaining_at_pause INTEGER;
    INSERT INTO pomodoro_sessions (task, duration_seconds, status, cycles)
      VALUES ('left running', 900, 'running', 2);
    INSERT INTO pomodoro_sessions (task, duration_seconds, status, cycles, completed_at)
      VALUES ('already done', 1500, 'completed', 1, 1700000000);
  `);
  seed.close();

  const db = await import("./index.js");
  db.initDatabase(dbPath);
});

const columns = () =>
  new Set(
    (
      new Database(dbPath)
        .prepare("PRAGMA table_info(pomodoro_sessions)")
        .all() as {
        name: string;
      }[]
    ).map((c) => c.name),
  );

describe("pomodoro schema migration", () => {
  it("adds the columns the older table is missing", () => {
    const cols = columns();
    expect(cols.has("phase")).toBe(true);
    expect(cols.has("ends_at")).toBe(true);
    expect(cols.has("updated_at")).toBe(true);
    expect(cols.has("remaining_at_pause")).toBe(true);
  });

  it("preserves the rows that were already there", async () => {
    const db = await import("./index.js");
    const rows = db.listPomodoroSessions(10);
    expect(rows.map((r) => r.task).sort()).toEqual([
      "already done",
      "left running",
    ]);
    const done = rows.find((r) => r.task === "already done");
    expect(done?.status).toBe("completed");
    expect(done?.completed_at).toBe(1700000000);
  });

  it("defaults migrated rows to a focus phase with no deadline", async () => {
    const db = await import("./index.js");
    const running = db
      .listPomodoroSessions(10)
      .find((r) => r.task === "left running");
    expect(running?.phase).toBe("focus");
    // No deadline to count down to, which is exactly what makes startup
    // recovery close this orphan out instead of showing a frozen clock.
    expect(running?.ends_at).toBeNull();
  });

  it("is a no-op the second time it runs", async () => {
    const db = await import("./index.js");
    expect(() => db.initDatabase(dbPath)).not.toThrow();
    expect(db.listPomodoroSessions(10)).toHaveLength(2);
  });
});
