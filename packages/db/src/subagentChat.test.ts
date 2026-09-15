import { beforeAll, describe, expect, it } from "vitest";
import * as db from "./index.js";

beforeAll(() => {
  db.initDatabase(":memory:");
});

const model = {
  name: "kimi",
  contextLength: 8192,
  capabilities: [],
  source: "cloud" as const,
};

describe("subagent chats", () => {
  it("creates a child chat pointing at its parent", () => {
    const parent = Number(db.createChat("Parent", model));
    const child = db.createSubagentChat(parent, "subagent:explore", model);
    expect(db.getChatById(child)?.title).toBe("subagent:explore");
    expect(db.getSubagentChat(parent, "explore")).toBe(child);
  });

  it("deletes child chats with the parent", () => {
    const parent = Number(db.createChat("Doomed parent", model));
    const child = db.createSubagentChat(parent, "subagent:general", model);
    db.deleteChat(parent);
    expect(db.getChatById(child)).toBeNull();
  });

  it("returns null when no child exists", () => {
    const parent = Number(db.createChat("No kids", model));
    expect(db.getSubagentChat(parent, "explore")).toBeNull();
  });
});
