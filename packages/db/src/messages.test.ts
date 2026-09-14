import { describe, expect, it, beforeAll } from "vitest";
import * as db from "./index.js";

beforeAll(() => {
  db.initDatabase(":memory:");
});

describe("messages", () => {
  it("orders same-second inserts by id, not arbitrarily", () => {
    const chatId = Number(
      db.createChat("Order test", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
    const user = db.insertMessage(chatId, "user", "hi");
    const assistant = db.insertMessage(chatId, "assistant", "hello");
    // created_at is unixepoch (second granularity): both rows share it. The
    // id tiebreak must keep insertion order, or a refetch can swap the reply
    // above the question.
    const rows = db.getMessages(chatId) as { id: number }[];
    expect(rows.map((r) => r.id)).toEqual([user, assistant]);
  });

  it("getMessage returns the full row", () => {
    const chatId = Number(
      db.createChat("Get test", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
    const modelId = db.upsertModel({
      name: "kimi",
      contextLength: 8192,
      capabilities: [],
      source: "cloud",
    });
    const id = db.insertMessage(chatId, "assistant", "kept", ["img"], modelId)!;
    db.updateMessage(id, {
      content: "updated",
      thinking: "thoughts",
      promptTokens: 10,
      evalTokens: 20,
      toolCalls: "[]",
    });
    const row = db.getMessage(id);
    expect(row).toMatchObject({
      id,
      chat_id: chatId,
      role: "assistant",
      content: "updated",
      thinking: "thoughts",
      prompt_tokens: 10,
      eval_tokens: 20,
      model_id: modelId,
    });
  });

  it("getMessage returns undefined for unknown ids", () => {
    expect(db.getMessage(999_999)).toBeUndefined();
  });

  it("partial update leaves untouched columns alone", () => {
    const chatId = Number(
      db.createChat("Partial test", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
    const id = db.insertMessage(chatId, "assistant", "")!;
    db.updateMessage(id, { content: "draft", thinking: "early" });
    db.updateMessage(id, { content: "final" });
    const row = db.getMessage(id);
    expect(row?.content).toBe("final");
    expect(row?.thinking).toBe("early");
    expect(row?.prompt_tokens).toBeNull();
  });
});

describe("resetAssistantMessage", () => {
  it("wipes content, thinking, tool trace and tool results, keeping the row", () => {
    const chatId = Number(
      db.createChat("Retry test", {
        name: "kimi",
        contextLength: 8192,
        capabilities: [],
        source: "cloud",
      }),
    );
    db.insertMessage(chatId, "user", "hi");
    const assistantId = db.insertMessage(
      chatId,
      "assistant",
      "**Error:** boom",
    );
    if (assistantId === null) throw new Error("insert failed");
    db.updateMessage(assistantId, {
      thinking: "hmm",
      toolCalls: JSON.stringify([{ tool: "bash", status: "error" }]),
      promptTokens: 42,
      evalTokens: 7,
      tokensMeasured: true,
    });
    db.insertToolResults(assistantId, [
      { callIndex: 0, content: "stale output" },
    ]);

    db.resetAssistantMessage(assistantId);

    const row = db.getMessage(assistantId) as {
      content: string;
      thinking: string | null;
      tool_calls: string | null;
      prompt_tokens: number | null;
      eval_tokens: number | null;
      tokens_measured: number | null;
    };
    expect(row.content).toBe("");
    expect(row.thinking).toBeNull();
    expect(row.tool_calls).toBeNull();
    expect(row.prompt_tokens).toBeNull();
    expect(row.eval_tokens).toBeNull();
    expect(row.tokens_measured).toBeNull();
    expect(db.getToolResultsForMessages([assistantId])).toEqual([]);

    // User rows are never touched, even by id collision attempts.
    const userId = db.insertMessage(chatId, "user", "still here");
    db.resetAssistantMessage(userId as number);
    expect(
      (db.getMessage(userId as number) as { content: string }).content,
    ).toBe("still here");
  });
});
