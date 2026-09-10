import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TodoWidget } from "@kotys/contracts";
import TodoCard from "./TodoCard";

const widget = (partial: Partial<TodoWidget>): TodoWidget => ({
  kind: "todo",
  action: "created",
  id: 1,
  title: "Buy milk",
  ...partial,
});

describe("TodoCard", () => {
  it("shows an unchecked task with its priority", () => {
    render(<TodoCard widget={widget({ priority: "high" })} />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByTitle("Created task")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders human due and reminder labels with the full date on hover", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 30, 0, 0);
    render(
      <TodoCard
        widget={widget({
          due_at: tomorrow.getTime(),
          notify_at: tomorrow.getTime(),
        })}
      />,
    );
    // Reminder collapses to a bare time when it shares the due day.
    expect(screen.getAllByText(/Today|Tomorrow/).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/202\d/).length).toBeGreaterThan(0);
  });

  it("normalises ISO date strings from create_todo", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    render(<TodoCard widget={widget({ due_at: tomorrow.toISOString() })} />);
    expect(screen.getByText(/Today|Tomorrow/)).toBeInTheDocument();
  });

  it("fades a deleted task and hides its checkbox and chips", () => {
    render(
      <TodoCard
        widget={widget({
          action: "deleted",
          status: "pending",
          priority: "low",
        })}
      />,
    );
    expect(screen.getByTitle("Deleted task")).toBeInTheDocument();
    expect(screen.queryByText("low")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("checkbox")).not.toBeInTheDocument();
  });

  it("marks a completed task checked and struck through", () => {
    render(
      <TodoCard
        widget={widget({ action: "completed", status: "completed" })}
      />,
    );
    expect(screen.getByTitle("Completed task")).toBeInTheDocument();
    const title = screen.getByText("Buy milk");
    expect(title.className).toContain("line-through");
  });

  it("flags an overdue task in red", () => {
    const past = new Date(Date.now() - 3 * 86_400_000);
    render(<TodoCard widget={widget({ due_at: past.getTime() })} />);
    expect(screen.getByText(/overdue/)).toBeInTheDocument();
  });
});
