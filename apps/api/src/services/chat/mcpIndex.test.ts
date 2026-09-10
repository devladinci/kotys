import { beforeAll, describe, expect, it } from "vitest";
import { getDb, initDatabase } from "@kotys/db";
import {
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
