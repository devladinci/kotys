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

  it("hides child chats from the user-facing chat list and search", () => {
    const parent = Number(db.createChat("Visible parent", model));
    const child = db.createSubagentChat(parent, "subagent:explore", model);
    const listed = db.listChatsWithTopics().some((c) => c.id === child);
    expect(listed).toBe(false);
    expect(db.listSubagentChats().some((c) => c.id === child)).toBe(true);
    const hits = db.searchMessages("Visible parent");
    expect(hits.some((h) => h.chat_id === child)).toBe(false);
  });

  it("lists the parent alongside its children for inspection", () => {
    const parent = Number(db.createChat("Inspect me", model));
    db.createSubagentChat(parent, "subagent:explore", model);
    db.createSubagentChat(parent, "subagent:general", model);
    const children = db.listSubagentChats(parent);
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.parent_id === parent)).toBe(true);
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
