import { beforeAll, describe, expect, it } from "vitest";
import type { ToolDefinition } from "@kotys/contracts";
import { getDb, initDatabase } from "@kotys/db";
import {
  LOADED_MCP_TOKEN_BUDGET,
  budgetLoadedMcpDefs,
  getLoadedMcpToolNames,
  mcpIndexTier,
  rememberLoadedMcpTools,
  withSystemBlocks,
} from "./mcpIndex.js";

beforeAll(() => initDatabase(":memory:"));

describe("mcpIndexTier", () => {
  it("picks the tier from context size", () => {
    expect(mcpIndexTier(300_000)).toBe("full");
    expect(mcpIndexTier(200_000)).toBe("full");
    expect(mcpIndexTier(199_999)).toBe("brief");
    expect(mcpIndexTier(64_000)).toBe("brief");
    expect(mcpIndexTier(63_999)).toBe("names");
    expect(mcpIndexTier(0)).toBe("names");
  });
});

describe("withSystemBlocks", () => {
  const index = "AVAILABLE TOOLS: …";

  it("prepends a system message when none exists", () => {
    const out = withSystemBlocks(
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      index,
    );
    expect(out[0].content).toBe(index);
    expect(out[1].content).toBe("hi");
  });
});

describe("loaded tool memory", () => {
  beforeAll(() => {
    const insert = getDb().prepare(
      "INSERT INTO chats (id, title) VALUES (?, 'probe')",
    );
    const run = getDb().transaction((ids: number[]) => {
      for (const id of ids) insert.run(id);
    });
    run([1, 2, 3, 7]);
  });

  it("remembers nothing for an unkeyed (null) chat", () => {
    rememberLoadedMcpTools(null, ["search"]);
    expect(getLoadedMcpToolNames(null)).toEqual([]);
  });

  it("ignores empty name lists", () => {
    rememberLoadedMcpTools(1, []);
    expect(getLoadedMcpToolNames(1)).toEqual([]);
  });

  it("returns what was loaded, per chat", () => {
    rememberLoadedMcpTools(2, ["alpha", "beta"]);
    expect(getLoadedMcpToolNames(2)).toEqual(["alpha", "beta"]);
    expect(getLoadedMcpToolNames(3)).toEqual([]);
  });

  it("survives across separate db handles (restart persistence)", () => {
    rememberLoadedMcpTools(7, ["persisted_tool"]);
    expect(getLoadedMcpToolNames(7)).toEqual(["persisted_tool"]);
  });

  it("rows die with the chat (cascade)", () => {
    getDb()
      .prepare("INSERT INTO chats (id, title) VALUES (8, 'cascade probe')")
      .run();
    rememberLoadedMcpTools(8, ["doomed"]);
    getDb().prepare("DELETE FROM chats WHERE id = 8").run();
    expect(getLoadedMcpToolNames(8)).toEqual([]);
  });
});

describe("budgetLoadedMcpDefs", () => {
  beforeAll(() => {
    const insert = getDb().prepare(
      "INSERT INTO chats (id, title) VALUES (?, 'budget probe')",
    );
    const run = getDb().transaction((ids: number[]) => {
      for (const id of ids) insert.run(id);
    });
    run([10, 11, 12, 13]);
  });

  const def = (name: string, size: number): ToolDefinition => ({
    type: "function",
    function: {
      name,
      description: "d".repeat(size),
      parameters: { type: "object", properties: {} },
    },
  });
  const resolve = (names: string[]) => names.map((n) => def(n, 100));

  it("passes everything through under budget", () => {
    rememberLoadedMcpTools(10, ["a", "b", "c"]);
    const { defs, dropped } = budgetLoadedMcpDefs(10, resolve);
    expect(defs.map((d) => d.function.name)).toEqual(["a", "b", "c"]);
    expect(dropped).toEqual([]);
  });

  it("keeps newest, drops coldest over budget, and forgets them", () => {
    const big = LOADED_MCP_TOKEN_BUDGET * 4;
    rememberLoadedMcpTools(11, ["old", "fresh"]);
    const { defs, dropped } = budgetLoadedMcpDefs(11, (names) =>
      names.map((n) => def(n, n === "fresh" ? big - 1 : big)),
    );
    expect(defs.map((d) => d.function.name)).toEqual(["fresh"]);
    expect(dropped).toEqual(["old"]);
    expect(getLoadedMcpToolNames(11)).toEqual(["fresh"]);
  });

  it("always keeps the first tool even when it alone exceeds budget", () => {
    rememberLoadedMcpTools(12, ["huge"]);
    const { defs, dropped } = budgetLoadedMcpDefs(12, (names) =>
      names.map((n) => def(n, LOADED_MCP_TOKEN_BUDGET * 8)),
    );
    expect(defs.map((d) => d.function.name)).toEqual(["huge"]);
    expect(dropped).toEqual([]);
  });

  it("returns empty for an unkeyed chat or unknown names", () => {
    expect(budgetLoadedMcpDefs(null, resolve)).toEqual({
      defs: [],
      dropped: [],
    });
    expect(budgetLoadedMcpDefs(13, () => [])).toEqual({
      defs: [],
      dropped: [],
    });
  });
});
