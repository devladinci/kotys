import { describe, expect, it, beforeAll } from "vitest";
import * as db from "./index.js";

beforeAll(() => {
  db.initDatabase(":memory:");
});

const MODEL = {
  name: "kimi",
  contextLength: 8192,
  capabilities: [],
  source: "cloud" as const,
};

const seedMessage = (
  chatId: number,
  role: string,
  promptTokens: number | null,
  evalTokens: number | null,
  toolCalls: unknown[] | null,
) => {
  const id = Number(
    db.insertMessage(chatId, role, "body", undefined, MODEL_ID),
  );
  const patch: Parameters<typeof db.updateMessage>[1] = {};
  if (promptTokens !== null) patch.promptTokens = promptTokens;
  if (evalTokens !== null) patch.evalTokens = evalTokens;
  if (toolCalls !== null) patch.toolCalls = JSON.stringify(toolCalls);
  db.updateMessage(id, patch);
  return id;
};

let MODEL_ID: number;

describe("analytics overview", () => {
  it("aggregates totals, models, tools and daily activity", () => {
    MODEL_ID = db.upsertModel(MODEL);
    const chatId = Number(db.createChat("Analytics", MODEL));

    seedMessage(chatId, "user", 100, null, null);
    seedMessage(chatId, "assistant", 200, 50, [
      { tool: "web_fetch", status: "done", durationMs: 400 },
      { tool: "web_fetch", status: "error", durationMs: 50 },
      { tool: "web_search", server: "hebros", status: "done", durationMs: 120 },
    ]);
    seedMessage(chatId, "assistant", 10, 5, null);

    const overview = db.getAnalyticsOverview(["web_fetch", "web_search"]);

    expect(overview.total_chats).toBeGreaterThanOrEqual(1);
    expect(overview.user_messages).toBeGreaterThanOrEqual(1);
    expect(overview.eval_tokens).toBeGreaterThanOrEqual(55);
    expect("prompt_tokens" in overview).toBe(false);

    const kimi = overview.models.find((m) => m.name === "kimi");
    expect(kimi).toBeDefined();
    expect(kimi!.messages).toBeGreaterThanOrEqual(2);
    expect(kimi!.eval_tokens).toBeGreaterThanOrEqual(55);
    expect(kimi!.last_used_at).toBeGreaterThan(0);

    const fetchTool = overview.tools.find(
      (t) => t.tool === "web_fetch" && t.server === null,
    );
    expect(fetchTool).toMatchObject({ calls: 2, errors: 1, total_ms: 450 });
    expect(overview.tools.find((t) => t.tool === "web_search")).toMatchObject({
      calls: 1,
      errors: 0,
      server: "hebros",
    });
  });

  it("classifies server-less rows via the built-in roster", () => {
    const chatId = Number(db.createChat("Legacy MCP", MODEL));

    // Older builds stored MCP calls without a server field. "mystery_tool"
    // is not in the roster, so it must surface as MCP; "web_fetch" is.
    seedMessage(chatId, "assistant", 1, 1, [
      { tool: "mystery_tool", status: "done", durationMs: 10 },
      { tool: "web_fetch", status: "done", durationMs: 20 },
    ]);

    const overview = db.getAnalyticsOverview(["web_fetch"]);

    expect(overview.tools.find((t) => t.tool === "mystery_tool")).toMatchObject(
      { server: "", calls: 1 },
    );
    expect(overview.tools.find((t) => t.tool === "web_fetch")).toMatchObject({
      server: null,
    });
  });
});

describe("activityDays bucketing", () => {
  it("keeps the same local day together and orders ascending", () => {
    const rows = [
      { created_at: 1_789_100_000, messages: 2, tokens: 10 },
      { created_at: 1_789_100_500, messages: 1, tokens: 5 },
      { created_at: 1_789_180_000, messages: 4, tokens: 40 },
    ];
    const days = db.activityDays(rows);
    expect(days.length).toBe(2);
    expect(days[0].day).toBeLessThan(days[1].day);
    expect(days[0].messages).toBe(3);
    expect(days[0].tokens).toBe(15);
    expect(days[1].messages).toBe(4);
    // Each bucket is a local midnight.
    for (const d of days) {
      const date = new Date(d.day * 1000);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    }
  });
});
