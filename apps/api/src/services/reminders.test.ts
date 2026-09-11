import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asEpochSeconds } from "@kotys/contracts";
import * as db from "@kotys/db";
import { events } from "./events.js";
import { deliverReminders } from "./reminders.js";

const raw = () => db.getDb();
const notifies: Array<{
  title: string;
  body: string;
  at?: number;
  todoId?: number;
}> = [];

beforeEach(() => {
  db.initDatabase(":memory:");
  raw().prepare("DELETE FROM todos").run();
  notifies.length = 0;
  events.onEvent("notify", (n) => void notifies.push(n));
});

afterEach(() => {
  events.removeAllListeners("notify");
  events.removeAllListeners("todos:open");
  events.removeAllListeners("todos:changed");
});

const createTodo = (title: string, notifyAt: number | null) => {
  const id = raw()
    .prepare(
      "INSERT INTO todos (title, status, notified, notify_at, created_at, updated_at) VALUES (?, 'pending', 0, ?, unixepoch(), unixepoch())",
    )
    .run(title, notifyAt).lastInsertRowid as number;
  return id;
};

describe("reminder scheduler", () => {
  it("notifies about a reminder that just became due", () => {
    const now = Date.now() / 1000;
    const id = createTodo("Water the plants", asEpochSeconds(now - 10));

    deliverReminders();

    expect(notifies).toHaveLength(1);
    expect(notifies[0]).toEqual({
      title: "Task reminder",
      body: "Water the plants",
      at: (now - 10) * 1000,
      todoId: id,
    });
    expect(db.getTodoById(id)?.notified).toBe(1);
  });

  it("a reminder older than two polls is late", () => {
    const now = Date.now() / 1000;
    createTodo("Stale", asEpochSeconds(now - 180));

    deliverReminders();

    expect(notifies.map((n) => n.title)).toEqual(["Task reminder (missed)"]);
  });

  it("does not deliver a reminder that is not due yet", () => {
    const now = Date.now() / 1000;
    createTodo("Future", asEpochSeconds(now + 3_600));

    deliverReminders();

    expect(notifies).toEqual([]);
  });

  it("collapses more than three due reminders into one notification", () => {
    const now = Date.now() / 1000;
    for (let i = 0; i < 5; i++) {
      createTodo(`Task ${i}`, asEpochSeconds(now - 10));
    }

    deliverReminders();

    expect(notifies).toHaveLength(1);
    expect(notifies[0].title).toBe("5 task reminders");
    expect(notifies[0].body).toBe("Task 0, Task 1, Task 2, and 2 more");
    expect(notifies[0].todoId).toBeUndefined();
  });
});
