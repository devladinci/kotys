import { describe, expect, it } from "vitest";
import { buildTodoWidget } from "./todoWidget.js";

describe("buildTodoWidget", () => {
  it("emits ISO strings for dates so the widget cannot be read as milliseconds", () => {
    const widget = buildTodoWidget("created", {
      id: 1,
      title: "Buy milk",
      description: null,
      due_at: 1_789_196_400,
      notify_at: null,
    });

    expect(widget.due_at).toBe(new Date(1_789_196_400 * 1000).toISOString());
    expect(widget.notify_at).toBeNull();
  });

  it("keeps null dates null", () => {
    const widget = buildTodoWidget("created", {
      id: 2,
      title: "Stretch",
      description: null,
      due_at: null,
      notify_at: null,
    });

    expect(widget.due_at).toBeNull();
    expect(widget.notify_at).toBeNull();
  });
});
