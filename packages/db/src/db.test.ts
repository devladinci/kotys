import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import type { PomodoroSessionRecord, TodoRecord } from "@kotys/contracts";
import { asEpochSeconds } from "@kotys/contracts";
import * as db from "./index.js";

beforeAll(() => {
  db.initDatabase(":memory:");
});

const raw = () => db.getDb();

describe("memory schema", () => {
  it("normalizes keys and topics on create", () => {
    const chatId = Number(
      db.createChat("Testing setup", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
    const m = db.createMemory({
      key: "Prefers Vitest!",
      content: "  Prefers Vitest over Jest.  ",
      type: "preference",
      topics: ["Testing", " TOOLING ", ""],
      sourceChatId: chatId,
    });
    expect(m.key).toBe("prefers-vitest");
    expect(m.content).toBe("Prefers Vitest over Jest.");
    expect(m.topics).toEqual(["testing", "tooling"]);
    expect(m.source_chat_title).toBe("Testing setup");
    expect(db.getMemoryByKey("PREFERS  vitest")?.id).toBe(m.id);
  });

  it("rejects a duplicate key", () => {
    expect(() =>
      db.createMemory({
        key: "prefers-vitest",
        content: "dupe",
        type: "fact",
        topics: [],
        sourceChatId: null,
      }),
    ).toThrow();
  });

  it("searches by query, topic, and type", () => {
    db.createMemory({
      key: "ships-on-fridays",
      content: "Deploys the desktop build on Fridays.",
      type: "project",
      topics: ["release"],
      sourceChatId: null,
    });
    expect(db.searchMemories({ query: "vitest" }).map((m) => m.key)).toEqual([
      "prefers-vitest",
    ]);
    expect(db.searchMemories({ query: "VITEST" })).toHaveLength(1);
    expect(db.searchMemories({ topic: "rele" }).map((m) => m.key)).toEqual([
      "ships-on-fridays",
    ]);
    expect(db.searchMemories({ type: "project" })).toHaveLength(1);
    expect(db.searchMemories({ query: "%" })).toHaveLength(0);
    expect(db.searchMemories({})).toHaveLength(2);
  });

  it("injects always-on types plus topic matches only", () => {
    const chatId = Number(
      db.createChat("Release chat", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );

    // No topics on the chat: only user/preference memories.
    expect(db.getMemoriesForChat(chatId).map((m) => m.key)).toEqual([
      "prefers-vitest",
    ]);

    db.setChatTopics(chatId, ["Release", "shipping"]);
    const withTopics = db.getMemoriesForChat(chatId).map((m) => m.key);
    expect(withTopics).toEqual(["prefers-vitest", "ships-on-fridays"]);

    // A chat about something else drops the project memory again.
    const other = Number(
      db.createChat("Cooking", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
    db.setChatTopics(other, ["recipes"]);
    expect(db.getMemoriesForChat(other).map((m) => m.key)).toEqual([
      "prefers-vitest",
    ]);
    expect(db.getMemoriesForChat(null).map((m) => m.key)).toEqual([
      "prefers-vitest",
    ]);
  });

  it("updates content and replaces topics", () => {
    const target = db.getMemoryByKey("ships-on-fridays")!;
    const updated = db.updateMemory(target.id, {
      content: "Deploys on Tuesdays now.",
      topics: ["Release", "cadence"],
    });
    expect(updated?.content).toBe("Deploys on Tuesdays now.");
    expect(updated?.topics).toEqual(["cadence", "release"]);
    expect(db.updateMemory(9999, { content: "nope" })).toBeNull();
  });

  it("deletes the row and its topics", () => {
    const target = db.getMemoryByKey("ships-on-fridays")!;
    expect(db.deleteMemory(target.id)?.key).toBe("ships-on-fridays");
    expect(db.getMemoryById(target.id)).toBeNull();
    const orphans = raw()
      .prepare("SELECT COUNT(*) AS n FROM memory_topics WHERE memory_id = ?")
      .get(target.id) as { n: number };
    expect(orphans.n).toBe(0);
    expect(db.deleteMemory(target.id)).toBeNull();
  });

  it("resolves a chat id from an assistant message id", () => {
    const chatId = Number(
      db.createChat("Traced", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
    const msgId = Number(db.insertMessage(chatId, "assistant", ""));
    expect(db.getChatIdForMessage(msgId)).toBe(chatId);
    expect(db.getChatIdForMessage(999999)).toBeNull();
  });

  it("survives deletion of the source chat", () => {
    const chatId = Number(
      db.createChat("Doomed", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
    const m = db.createMemory({
      key: "orphan-check",
      content: "Still here.",
      type: "fact",
      topics: [],
      sourceChatId: chatId,
    });
    db.deleteChat(chatId);
    const after = db.getMemoryById(m.id);
    expect(after?.content).toBe("Still here.");
    expect(after?.source_chat_title).toBeNull();
  });
});

describe("foreign key enforcement", () => {
  const newChat = (title: string) =>
    Number(
      db.createChat(title, {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
  const count = (sql: string, ...params: unknown[]) =>
    (
      raw()
        .prepare(sql)
        .get(...params) as { n: number }
    ).n;

  it("has the pragma on", () => {
    expect(raw().pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("cascades messages and topics when a chat is deleted", () => {
    const chatId = newChat("Cascade");
    db.insertMessage(chatId, "user", "hello");
    db.insertMessage(chatId, "assistant", "hi");
    db.setChatTopics(chatId, ["greetings"]);

    db.deleteChat(chatId);

    expect(
      count("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?", chatId),
    ).toBe(0);
    expect(
      count("SELECT COUNT(*) AS n FROM chat_topics WHERE chat_id = ?", chatId),
    ).toBe(0);
  });

  it("nulls source_chat_id rather than deleting the memory", () => {
    const chatId = newChat("Source");
    const m = db.createMemory({
      key: "set-null-check",
      content: "Outlives its chat.",
      type: "fact",
      topics: [],
      sourceChatId: chatId,
    });
    expect(db.getMemoryById(m.id)?.source_chat_id).toBe(chatId);

    db.deleteChat(chatId);
    expect(db.getMemoryById(m.id)?.source_chat_id).toBeNull();
  });

  it("drops a message whose chat is already gone instead of throwing", () => {
    const chatId = newChat("Raced");
    db.deleteChat(chatId);
    expect(db.insertMessage(chatId, "user", "into the void")).toBeNull();
    expect(
      count("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?", chatId),
    ).toBe(0);
  });

  it("degrades a missing source chat to null on create", () => {
    const chatId = newChat("Vanished");
    db.deleteChat(chatId);
    const m = db.createMemory({
      key: "degraded-source",
      content: "Written after its chat went away.",
      type: "fact",
      topics: ["orphans"],
      sourceChatId: chatId,
    });
    expect(m.source_chat_id).toBeNull();
    expect(m.topics).toEqual(["orphans"]);
  });
});

describe("model listing refresh", () => {
  it("rewrites context_length in place for an existing chat's model", () => {
    const chatId = Number(
      db.createChat("Stale window", {
        name: "gemma-4-26b-a4b-it-4bit",
        provider: "omlx",
        contextLength: 16_384,
        capabilities: [],
        source: "local",
      }),
    );
    expect(db.getChatById(chatId)?.model_context_length).toBe(16_384);

    db.refreshModels([
      {
        name: "gemma-4-26b-a4b-it-4bit",
        provider: "omlx",
        contextLength: 32_768,
        capabilities: ["thinking"],
        source: "local",
      },
    ]);
    expect(db.getChatById(chatId)?.model_context_length).toBe(32_768);
  });

  it("does not insert listings nothing points at", () => {
    db.refreshModels([
      {
        name: "never-used-model",
        provider: "omlx",
        contextLength: 32_768,
        capabilities: [],
        source: "local",
      },
    ]);
    expect(
      db
        .getDb()
        .prepare("SELECT COUNT(*) AS n FROM models WHERE name = ?")
        .get("never-used-model"),
    ).toEqual({ n: 0 });
  });

  it("leaves rows the listing does not mention alone", () => {
    const chatId = Number(
      db.createChat("Untouched", {
        name: "kept-model",
        provider: "omlx",
        contextLength: 8_192,
        capabilities: [],
        source: "local",
      }),
    );
    db.refreshModels([
      {
        name: "some-other-model",
        provider: "omlx",
        contextLength: 65_536,
        capabilities: [],
        source: "local",
      },
    ]);
    expect(db.getChatById(chatId)?.model_context_length).toBe(8_192);
  });

  it("keeps stored detail when a listing comes back thin", () => {
    const chatId = Number(
      db.createChat("Degraded listing", {
        name: "detailed-model",
        provider: "omlx",
        contextLength: 32_768,
        capabilities: ["thinking", "vision"],
        source: "local",
      }),
    );
    db.refreshModels([
      {
        name: "detailed-model",
        provider: "omlx",
        contextLength: null,
        capabilities: [],
        source: "local",
      },
    ]);
    const chat = db.getChatById(chatId);
    expect(chat?.model_context_length).toBe(32_768);
    expect(
      db
        .getDb()
        .prepare("SELECT capabilities FROM models WHERE name = ?")
        .get("detailed-model"),
    ).toEqual({ capabilities: '["thinking","vision"]' });
  });

  it("matches on the full identity, not the name alone", () => {
    const chatId = Number(
      db.createChat("Local twin", {
        name: "twin",
        provider: "ollama",
        contextLength: 8_192,
        capabilities: [],
        source: "local",
      }),
    );
    db.refreshModels([
      {
        name: "twin",
        provider: "ollama",
        contextLength: 262_144,
        capabilities: [],
        source: "cloud",
      },
    ]);
    expect(db.getChatById(chatId)?.model_context_length).toBe(8_192);
  });
});

describe("todos", () => {
  const MODEL = {
    name: "kimi",
    contextLength: 8192,
    capabilities: [],
    source: "cloud" as const,
  };

  it("applies defaults on create and reads the row back", () => {
    const id = db.createTodo({ title: "Write the tests" });
    const todo = db.getTodoById(id);
    expect(todo).not.toBeNull();
    expect(todo?.title).toBe("Write the tests");
    expect(todo?.status).toBe("pending");
    expect(todo?.priority).toBe("medium");
    expect(todo?.created_by).toBe("user");
    expect(todo?.due_at).toBeNull();
    expect(todo?.notified).toBe(0);
  });

  it("only writes whitelisted columns on update", () => {
    const id = db.createTodo({ title: "Original" });
    const updated = db.updateTodo(id, {
      title: "Renamed",
      priority: "high",
      // Not in TODO_UPDATABLE: must be ignored rather than reaching the SQL.
      id: 9999,
      created_at: 0,
    } as Partial<TodoRecord>);
    expect(updated?.id).toBe(id);
    expect(updated?.title).toBe("Renamed");
    expect(updated?.priority).toBe("high");
    expect(updated?.created_at).not.toBe(0);
  });

  it("returns the row unchanged when no updatable field is passed", () => {
    const id = db.createTodo({ title: "Untouched" });
    const before = db.getTodoById(id);
    const after = db.updateTodo(id, { created_at: 0 } as Partial<TodoRecord>);
    expect(after).toEqual(before);
  });

  it("toggles between completed and pending, stamping completed_at in seconds", () => {
    const id = db.createTodo({ title: "Toggle me" });
    const done = db.toggleTodoStatus(id);
    expect(done?.status).toBe("completed");
    // Seconds, like created_at/updated_at — a millisecond stamp would be ~1000x
    // larger and drift far away from the sibling columns.
    expect(done?.completed_at).toBeCloseTo(Math.floor(Date.now() / 1000), -1);
    expect(done?.completed_at).toBeLessThan(done!.created_at + 60);

    const reopened = db.toggleTodoStatus(id);
    expect(reopened?.status).toBe("pending");
    expect(reopened?.completed_at).toBeNull();
  });

  it("filters by status and by having a due date", () => {
    const raw_ = raw();
    raw_.prepare("DELETE FROM todos").run();
    db.createTodo({ title: "plain" });
    db.createTodo({
      title: "dated",
      due_at: asEpochSeconds(Date.now() / 1000 + 60),
    });
    const doneId = db.createTodo({ title: "finished" });
    db.toggleTodoStatus(doneId);

    expect(db.listTodos().length).toBe(3);
    expect(db.listTodos({ status: "all" }).length).toBe(3);
    expect(db.listTodos({ status: "completed" }).map((t) => t.title)).toEqual([
      "finished",
    ]);
    expect(db.listTodos({ has_due_date: true }).map((t) => t.title)).toEqual([
      "dated",
    ]);
  });

  it("returns reminders that came due while the app was not running", () => {
    raw().prepare("DELETE FROM todos").run();
    const now = Date.now() / 1000;
    // Far outside any 60s polling window: the query must still surface it,
    // otherwise a reminder missed during sleep is lost forever.
    const stale = db.createTodo({
      title: "stale",
      notify_at: asEpochSeconds(now - 86_400),
    });
    const soon = db.createTodo({
      title: "soon",
      notify_at: asEpochSeconds(now - 1),
    });
    db.createTodo({ title: "future", notify_at: asEpochSeconds(now + 86_400) });

    const due = db.getDueReminders(now);
    expect(due.map((t) => t.id)).toEqual([stale, soon]);

    db.markTodoNotified(stale);
    expect(db.getDueReminders(now).map((t) => t.id)).toEqual([soon]);
  });

  it("does not remind about completed or archived todos", () => {
    raw().prepare("DELETE FROM todos").run();
    const now = Date.now() / 1000;
    const done = db.createTodo({
      title: "done",
      notify_at: asEpochSeconds(now - 1),
    });
    db.toggleTodoStatus(done);
    const archived = db.createTodo({
      title: "archived",
      notify_at: asEpochSeconds(now - 1),
    });
    db.updateTodo(archived, { status: "archived" });

    expect(db.getDueReminders(now)).toEqual([]);
  });

  it("gives a todo chat the model columns a normal chat gets", () => {
    const todoId = db.createTodo({ title: "Discuss me" });
    const chatId = db.createChatForTodo(todoId, "Todo: Discuss me", MODEL);
    const row = raw()
      .prepare(
        "SELECT title, m.name AS model FROM chats c JOIN models m ON m.id = c.model_id WHERE c.id = ?",
      )
      .get(chatId) as { title: string; model: string };
    expect(row.title).toBe("Todo: Discuss me");
    expect(row.model).toBe("kimi");
    expect(db.getChatByTodoId(todoId)).toBe(chatId);
  });

  it("clears chat_id but keeps the todo when its chat is deleted", () => {
    const chatId = Number(db.createChat("Doomed", MODEL));
    const todoId = db.createTodo({ title: "Survivor", chat_id: chatId });
    db.deleteChat(chatId);
    expect(db.getTodoById(todoId)?.chat_id).toBeNull();
  });

  it("deletes a todo", () => {
    const id = db.createTodo({ title: "Temporary" });
    expect(db.deleteTodo(id)).toBe(true);
    expect(db.getTodoById(id)).toBeNull();
  });

  it("reports that nothing was deleted for an unknown id", () => {
    expect(db.deleteTodo(999_999)).toBe(false);
  });

  // The storage layer deliberately still accepts past dates — that is how a
  // task that has *become* overdue is represented, and how the reminder tests
  // below set up their fixtures. Scheduling into the past is refused at the
  // entry points (IPC handlers and agent tools), not here.
  it("still stores a task that has become overdue", () => {
    const id = db.createTodo({
      title: "Went stale",
      due_at: asEpochSeconds(Date.now() / 1000 - 86_400),
    });
    expect(db.getTodoById(id)?.due_at).toBeLessThan(Date.now() / 1000);
  });

  it("persists sort_order across reorders and orders by it within a due-date group", () => {
    raw().prepare("DELETE FROM todos").run();
    const due = asEpochSeconds(Date.now() / 1000 + 86_400);
    const a = db.createTodo({ title: "A", due_at: due });
    const b = db.createTodo({ title: "B", due_at: due });
    const c = db.createTodo({ title: "C", due_at: due });

    db.reorderTodos([c, a, b]);
    const ordered = db.listTodos({ has_due_date: true }).map((t) => t.id);
    expect(ordered).toEqual([c, a, b]);
    // Ranks are sparse and 1-based; 0 stays the "never ordered by hand" value.
    expect(db.getTodoById(c)?.sort_order).toBe(1000);
    expect(db.getTodoById(b)?.sort_order).toBe(3000);
  });

  // Regression: `notified` is the once-only guard, and nothing used to clear
  // it — so a task whose reminder had fired could never remind again, however
  // many times the reminder was moved.
  it("re-arms the reminder when notify_at changes", () => {
    const id = db.createTodo({
      title: "Ping me",
      notify_at: asEpochSeconds(Date.now() / 1000 - 1),
    });
    db.markTodoNotified(id);
    expect(db.getTodoById(id)?.notified).toBe(1);

    db.updateTodo(id, { notify_at: asEpochSeconds(Date.now() / 1000 + 3_600) });
    expect(db.getTodoById(id)?.notified).toBe(0);
  });

  it("leaves notified alone when the reminder is untouched", () => {
    const id = db.createTodo({
      title: "Ping me",
      notify_at: asEpochSeconds(Date.now() / 1000 + 1),
    });
    db.markTodoNotified(id);
    db.updateTodo(id, { title: "Ping me twice" });
    expect(db.getTodoById(id)?.notified).toBe(1);
  });

  it("re-arms a still-future reminder when a task is reopened", () => {
    const id = db.createTodo({
      title: "Standup",
      notify_at: asEpochSeconds(Date.now() / 1000 + 3_600),
    });
    db.markTodoNotified(id);
    db.toggleTodoStatus(id);
    db.toggleTodoStatus(id);
    expect(db.getTodoById(id)?.status).toBe("pending");
    expect(db.getTodoById(id)?.notified).toBe(0);
  });

  it("does not re-arm a reminder that is already in the past", () => {
    const id = db.createTodo({
      title: "Old",
      notify_at: asEpochSeconds(Date.now() / 1000 - 3_600),
    });
    db.markTodoNotified(id);
    db.toggleTodoStatus(id);
    db.toggleTodoStatus(id);
    expect(db.getTodoById(id)?.notified).toBe(1);
  });

  // `undefined` reaching the binder was coerced to SQL NULL, so a partial
  // update silently cleared columns the caller never mentioned.
  it("ignores undefined fields instead of nulling the column", () => {
    const id = db.createTodo({ title: "Keep me", description: "context" });
    db.updateTodo(id, { title: "Keep me too", description: undefined });
    expect(db.getTodoById(id)?.description).toBe("context");
  });

  it("unlinks the chat when its task is deleted", () => {
    const todoId = db.createTodo({ title: "Has a chat" });
    const chatId = db.createChatForTodo(todoId, "Todo: Has a chat", {
      name: "kimi",
      contextLength: 8192,
      capabilities: [],
      source: "cloud",
    });
    expect(db.getChatByTodoId(todoId)).toBe(chatId);

    db.deleteTodo(todoId);
    expect(db.getChatByTodoId(todoId)).toBeNull();
    expect(
      raw().prepare("SELECT todo_id FROM chats WHERE id = ?").get(chatId),
    ).toEqual({ todo_id: null });
  });

  // Regression: due_at used to outrank sort_order, so dragging a task above
  // one with an earlier due date was silently undone by the next read.
  it("keeps a manual order that contradicts the due dates", () => {
    raw().prepare("DELETE FROM todos").run();
    const morning = db.createTodo({
      title: "morning",
      due_at: asEpochSeconds(Date.now() / 1000 + 3_600),
    });
    const evening = db.createTodo({
      title: "evening",
      due_at: asEpochSeconds(Date.now() / 1000 + 36_000),
    });

    db.reorderTodos([evening, morning]);
    expect(db.listTodos().map((t) => t.id)).toEqual([evening, morning]);
  });

  it("sorts null due dates last regardless of sort_order", () => {
    raw().prepare("DELETE FROM todos").run();
    const undated = db.createTodo({ title: "undated" });
    const dated = db.createTodo({
      title: "dated",
      due_at: asEpochSeconds(Date.now() / 1000 + 1),
    });
    const ordered = db.listTodos().map((t) => t.id);
    expect(ordered[0]).toBe(dated);
    expect(ordered[1]).toBe(undated);
  });
});

describe("pomodoro sessions", () => {
  beforeEach(() => {
    raw().exec("DELETE FROM pomodoro_sessions");
  });

  const nowSec = () => Math.floor(Date.now() / 1000);

  it("starts in focus with a deadline derived from the duration", () => {
    const s = db.createPomodoroSession({
      task: "Write",
      duration_seconds: 600,
    });
    expect(s.status).toBe("running");
    expect(s.phase).toBe("focus");
    expect(s.remaining_at_pause).toBeNull();
    expect(s.ends_at).not.toBeNull();
    expect(s.ends_at! - nowSec()).toBeGreaterThan(595);
    expect(s.ends_at! - nowSec()).toBeLessThanOrEqual(600);
  });

  it("does not stamp completed_at when a running session is cancelled", () => {
    const s = db.createPomodoroSession({ duration_seconds: 600 });
    const stopped = db.stopPomodoroSession(s.id, "cancelled");
    expect(stopped?.status).toBe("cancelled");
    // A cancelled session that reports a completion time inflates every
    // "sessions completed" number derived from this table.
    expect(stopped?.completed_at).toBeNull();
    expect(stopped?.ended_at).not.toBeNull();
    expect(stopped?.ends_at).toBeNull();
  });

  it("stamps completed_at only on a real completion", () => {
    const s = db.createPomodoroSession({ duration_seconds: 600 });
    const done = db.stopPomodoroSession(s.id, "completed");
    expect(done?.status).toBe("completed");
    expect(done?.completed_at).not.toBeNull();
  });

  it("round-trips the remaining time through pause and resume", () => {
    const s = db.createPomodoroSession({ duration_seconds: 600 });
    const paused = db.pausePomodoroSession(s.id, 412);
    expect(paused?.status).toBe("paused");
    expect(paused?.remaining_at_pause).toBe(412);
    expect(paused?.ends_at).toBeNull();

    const resumed = db.resumePomodoroSession(s.id);
    expect(resumed?.status).toBe("running");
    expect(resumed?.remaining_at_pause).toBeNull();
    // Resumes with what was left, not the full duration.
    expect(resumed!.ends_at! - nowSec()).toBeGreaterThan(407);
    expect(resumed!.ends_at! - nowSec()).toBeLessThanOrEqual(412);
  });

  it("keeps the phase across a pause taken during a break", () => {
    const s = db.createPomodoroSession({
      duration_seconds: 600,
      break_seconds: 120,
    });
    db.updatePomodoroSession(s.id, { phase: "break", ends_at: nowSec() + 120 });
    db.pausePomodoroSession(s.id, 90);
    const resumed = db.resumePomodoroSession(s.id);
    // Resuming used to silently restart the session in "focus".
    expect(resumed?.phase).toBe("break");
    expect(resumed!.ends_at! - nowSec()).toBeGreaterThan(85);
  });

  it("refuses to update a field it cannot persist", () => {
    const s = db.createPomodoroSession({ duration_seconds: 600 });
    expect(() =>
      db.updatePomodoroSession(s.id, {
        started_at: 1,
      } as Partial<PomodoroSessionRecord>),
    ).toThrow(/started_at/);
  });

  it("cancels orphaned sessions but spares the one still in play", () => {
    const first = db.createPomodoroSession({ duration_seconds: 600 });
    db.pausePomodoroSession(first.id, 100);
    const second = db.createPomodoroSession({ duration_seconds: 600 });
    const third = db.createPomodoroSession({ duration_seconds: 600 });

    expect(db.cancelStalePomodoroSessions(third.id)).toBe(2);
    expect(db.getPomodoroSessionById(first.id)?.status).toBe("cancelled");
    expect(db.getPomodoroSessionById(second.id)?.status).toBe("cancelled");
    expect(db.getPomodoroSessionById(third.id)?.status).toBe("running");
    expect(db.getActivePomodoroSession()?.id).toBe(third.id);
    // Orphans must not keep a live deadline the UI could still count down.
    expect(db.getPomodoroSessionById(second.id)?.ends_at).toBeNull();
  });

  it("cancels every live session when no survivor is named", () => {
    db.createPomodoroSession({ duration_seconds: 600 });
    db.createPomodoroSession({ duration_seconds: 600 });
    expect(db.cancelStalePomodoroSessions()).toBe(2);
    expect(db.getActivePomodoroSession()).toBeNull();
  });
});
