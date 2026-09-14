import { describe, expect, it, beforeAll, beforeEach, afterEach } from "vitest";
import { initDatabase, getDb, createChat } from "@kotys/db";
import { runTool } from "./index.js";
import type { ToolContext } from "./types.js";
import { asEpochSeconds } from "@kotys/contracts";

const nowS = (): number => Math.floor(Date.now() / 1000);
const future = (): number => nowS() + 3_600;

const testContext = (partial: Partial<ToolContext>): ToolContext =>
  ({ signal: new AbortController().signal, ...partial }) as ToolContext;

beforeAll(() => {
  initDatabase(":memory:");
});

let chatId: number;
beforeEach(() => {
  chatId = Number(
    createChat("todo date args test", {
      name: "test",
      contextLength: 8192,
      capabilities: [],
      source: "local",
    }),
  );
});

afterEach(async () => {
  getDb().prepare("DELETE FROM todos").run();
  getDb().prepare("DELETE FROM chats").run();
});

const getTodo = (id: number) => {
  const row = getDb().prepare("SELECT * FROM todos WHERE id = ?").get(id) as
    { due_at: number | null; notify_at: number | null } | undefined;
  if (!row) throw new Error(`todo ${id} missing`);
  return row;
};

describe("todo date arguments arrive as strings", () => {
  it("create_todo accepts a numeric string", async () => {
    const due = future();
    const result = await runTool(
      "create_todo",
      { title: "Invoice", due_at: String(due) },
      testContext({ homedir: "/tmp", chatId }),
    );
    const body = JSON.parse(result.content) as {
      created: boolean;
      todo: { id: number };
    };
    expect(body.created).toBe(true);
    expect(getTodo(body.todo.id).due_at).toBe(due);
  });

  it("create_todo accepts an ISO 8601 string", async () => {
    const iso = new Date((future() + 60) * 1000).toISOString();
    const result = await runTool(
      "create_todo",
      { title: "Invoice", notify_at: iso },
      testContext({ homedir: "/tmp", chatId }),
    );
    const body = JSON.parse(result.content) as {
      created: boolean;
      todo: { id: number };
    };
    expect(body.created).toBe(true);
    expect(getTodo(body.todo.id).notify_at).toBe(
      Math.round(Date.parse(iso) / 1000),
    );
  });

  it("create_todo still accepts real numbers", async () => {
    const due = future() + 120;
    const result = await runTool(
      "create_todo",
      { title: "Invoice", due_at: due },
      testContext({ homedir: "/tmp", chatId }),
    );
    const body = JSON.parse(result.content) as {
      created: boolean;
      todo: { id: number };
    };
    expect(body.created).toBe(true);
    expect(getTodo(body.todo.id).due_at).toBe(due);
  });

  it("create_todo rejects a garbage string instead of silently dropping it", async () => {
    const result = await runTool(
      "create_todo",
      { title: "Invoice", due_at: "next tuesday-ish" },
      testContext({ homedir: "/tmp", chatId }),
    );
    const body = JSON.parse(result.content) as {
      created: boolean;
      reason?: string;
    };
    expect(body.created).toBe(false);
    expect(body.reason).toContain("due_at");
  });

  it("update_todo accepts a numeric string and stores it", async () => {
    const created = JSON.parse(
      (
        await runTool(
          "create_todo",
          { title: "Invoice" },
          testContext({ homedir: "/tmp", chatId }),
        )
      ).content,
    ) as { todo: { id: number } };
    const due = future() + 300;
    const result = await runTool(
      "update_todo",
      { id: String(created.todo.id), due_at: String(due) },
      testContext({ homedir: "/tmp", chatId }),
    );
    const body = JSON.parse(result.content) as {
      updated: boolean;
      todo: { due_at: string | null };
    };
    expect(body.updated).toBe(true);
    expect(getTodo(created.todo.id).due_at).toBe(due);
    expect(body.todo.due_at).toBe(new Date(due * 1000).toISOString());
  });

  it("update_todo still clears with an explicit null", async () => {
    const created = JSON.parse(
      (
        await runTool(
          "create_todo",
          { title: "Invoice", due_at: asEpochSeconds(future()) },
          testContext({ homedir: "/tmp", chatId }),
        )
      ).content,
    ) as { todo: { id: number } };
    const result = await runTool(
      "update_todo",
      { id: String(created.todo.id), due_at: null },
      testContext({ homedir: "/tmp", chatId }),
    );
    const body = JSON.parse(result.content) as { updated: boolean };
    expect(body.updated).toBe(true);
    expect(getTodo(created.todo.id).due_at).toBeNull();
  });

  it("update_todo refuses a numeric string that parses to the past instead of clearing", async () => {
    const created = JSON.parse(
      (
        await runTool(
          "create_todo",
          { title: "Invoice" },
          testContext({ homedir: "/tmp", chatId }),
        )
      ).content,
    ) as { todo: { id: number } };
    const past = String(nowS() - 3_600);
    const result = await runTool(
      "update_todo",
      { id: String(created.todo.id), due_at: past },
      testContext({ homedir: "/tmp", chatId }),
    );
    const body = JSON.parse(result.content) as {
      updated: boolean;
      reason?: string;
    };
    expect(body.updated).toBe(false);
    expect(body.reason).toContain("past");
    expect(getTodo(created.todo.id).due_at).toBeNull();
  });

  it("update_todo rejects a garbage string instead of reporting success with a cleared date", async () => {
    const created = JSON.parse(
      (
        await runTool(
          "create_todo",
          { title: "Invoice", due_at: asEpochSeconds(future()) },
          testContext({ homedir: "/tmp", chatId }),
        )
      ).content,
    ) as { todo: { id: number } };
    const original = getTodo(created.todo.id).due_at;
    const result = await runTool(
      "update_todo",
      { id: String(created.todo.id), due_at: "not a date" },
      testContext({ homedir: "/tmp", chatId }),
    );
    const body = JSON.parse(result.content) as {
      updated: boolean;
      reason?: string;
    };
    expect(body.updated).toBe(false);
    expect(body.reason).toContain("due_at");
    expect(getTodo(created.todo.id).due_at).toBe(original);
  });
});
