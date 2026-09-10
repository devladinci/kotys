import { describe, expect, it } from "vitest";
import { DEDUPED_TOOLS, TODO_TOOLS, stableArgsKey } from "./toolDedup.js";

describe("stableArgsKey", () => {
  it("is order-independent for the same arguments", () => {
    expect(stableArgsKey({ path: "a", content: "b" })).toBe(
      stableArgsKey({ content: "b", path: "a" }),
    );
  });

  it("separates different arguments", () => {
    expect(stableArgsKey({ path: "a" })).not.toBe(stableArgsKey({ path: "b" }));
    expect(stableArgsKey({ path: "a", flag: true })).not.toBe(
      stableArgsKey({ path: "a", flag: false }),
    );
  });

  it("distinguishes key sets and preserves values structurally", () => {
    expect(stableArgsKey({ a: 1 })).not.toBe(stableArgsKey({ a: "1" }));
    expect(stableArgsKey({ a: 1, b: 2 })).toBe(stableArgsKey({ b: 2, a: 1 }));
  });

  it("is stable for nested objects regardless of inner key order", () => {
    const a = stableArgsKey({
      path: "x",
      options: { recursive: true, depth: 3 },
    });
    const b = stableArgsKey({
      options: { depth: 3, recursive: true },
      path: "x",
    });
    // A model re-emitting the same call with shuffled nested keys is still the
    // same call — the dedupe key must not depend on serialization order.
    expect(a).toBe(b);
  });

  it("is stable at every nesting level", () => {
    const a = stableArgsKey({
      outer: { middle: { left: 1, right: 2 }, other: true },
      path: "x",
    });
    const b = stableArgsKey({
      path: "x",
      outer: { other: true, middle: { right: 2, left: 1 } },
    });
    expect(a).toBe(b);
  });

  it("still distinguishes differing values inside nested objects", () => {
    expect(stableArgsKey({ o: { a: 1 } })).not.toBe(
      stableArgsKey({ o: { a: 2 } }),
    );
    // Different keys can't collapse into one canonical form.
    expect(stableArgsKey({ o: { a: 1 } })).not.toBe(
      stableArgsKey({ o: { b: 1 } }),
    );
  });

  it("treats different nested values as different calls", () => {
    expect(stableArgsKey({ options: { depth: 3 } })).not.toBe(
      stableArgsKey({ options: { depth: 4 } }),
    );
  });

  it("treats different nested key orderings inside arrays consistently", () => {
    // Arrays are sequences — order is meaningful there and must be preserved.
    expect(stableArgsKey({ a: [1, 2] })).not.toBe(stableArgsKey({ a: [2, 1] }));
    expect(stableArgsKey({ a: ["b", "c"] })).toBe(
      stableArgsKey({ a: ["b", "c"] }),
    );
  });
});

describe("dedupe sets", () => {
  it("DEDUPED_TOOLS covers deterministic reads only", () => {
    expect([...DEDUPED_TOOLS].sort()).toEqual(
      [
        "read_file",
        "list",
        "grep",
        "web_fetch",
        "web_search",
        "search_memories",
        "list_chats",
        "search_chats",
        "get_chat",
      ].sort(),
    );
    // Side-effectful or presentation tools must never be deduped.
    expect(DEDUPED_TOOLS.has("write_file")).toBe(false);
    expect(DEDUPED_TOOLS.has("current_datetime")).toBe(false);
    expect(DEDUPED_TOOLS.has("bash")).toBe(false);
  });

  it("TODO_TOOLS covers exactly the four todo mutators", () => {
    expect(TODO_TOOLS.size).toBe(4);
    for (const t of [
      "create_todo",
      "update_todo",
      "complete_todo",
      "delete_todo",
    ])
      expect(TODO_TOOLS.has(t)).toBe(true);
    expect(TODO_TOOLS.has("list_todos")).toBe(false);
  });

  it("the two sets do not overlap", () => {
    for (const t of TODO_TOOLS) expect(DEDUPED_TOOLS.has(t)).toBe(false);
  });
});
