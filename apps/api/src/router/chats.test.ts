import { beforeAll, describe, expect, it } from "vitest";
import {
  initDatabase,
  createChat,
  createSubagentChat,
  insertMessage,
} from "@kotys/db";
import type { ModelListing } from "@kotys/contracts";
import { chatsRouter } from "./chats.js";

const MODEL: ModelListing = {
  name: "test-model",
  provider: "test",
  source: "cloud",
  contextLength: 8192,
  capabilities: [],
};

const list = chatsRouter.list.callable({
  context: { clientId: null },
}) as unknown as () => Promise<{ id: number; title: string }[]>;

beforeAll(() => {
  initDatabase(":memory:");
});

describe("chats.list", () => {
  it("serves only user chats — subagent children stay off the list", async () => {
    const parent = Number(createChat("Visible parent", MODEL));
    const child = createSubagentChat(parent, "subagent:explore", MODEL);
    const rows = await list();
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(parent);
    expect(ids).not.toContain(child);
  });
});

describe("messages.search reachability", () => {
  it("does not surface child-chat messages through the shared query", async () => {
    const parent = Number(createChat("Needle parent", MODEL));
    const child = createSubagentChat(parent, "subagent:general", MODEL);
    insertMessage(child, "user", "xyzzy unique needle text");
    const { searchMessages } = await import("@kotys/db");
    const hits = searchMessages("xyzzy unique needle");
    expect(hits).toHaveLength(0);
  });
});
