import {
  describe,
  expect,
  it,
  afterEach,
  beforeEach,
  vi,
  type MockedFunction,
} from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodoRecord } from "@kotys/contracts";
import { asEpochSeconds, toSeconds, asEpochMillis } from "@kotys/contracts";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { rpc, initTestClients } = await import("../../test/mocks/rpc");

const TodoForm = (await import("./TodoForm")).default;
const { useTodoStore, UNDO_WINDOW_MS } = await import("@kotys/core");

const rpcCreateTodo = rpc.todos.create as MockedFunction<
  typeof rpc.todos.create
>;
const rpcUpdateTodo = rpc.todos.update as MockedFunction<
  typeof rpc.todos.update
>;
const rpcReorderTodos = rpc.todos.reorder as MockedFunction<
  typeof rpc.todos.reorder
>;
const rpcDeleteTodo = rpc.todos.remove as MockedFunction<
  typeof rpc.todos.remove
>;
const rpcListTodos = rpc.todos.list as MockedFunction<typeof rpc.todos.list>;

// 20 Aug 2026, 15:30 local time — built from local parts so the assertions
// hold whatever timezone the suite runs in.
const DUE = asEpochSeconds(
  Math.floor(new Date(2026, 7, 20, 15, 30, 0, 0).getTime() / 1000),
);

// The form rejects dates in the past, so a fixed DUE is only submittable while
// the real clock is behind it: these tests passed in the morning and failed
// once the afternoon caught up with 15:30. Pinning "now" to that morning keeps
// every date below in the future no matter when the suite runs.
const NOW = new Date(2026, 7, 20, 9, 0, 0, 0);

const todo: TodoRecord = {
  id: 7,
  chat_id: null,
  title: "Renew the domain",
  description: "Before it lapses",
  status: "pending",
  priority: "high",
  due_at: DUE,
  notify_at: null,
  notified: 0,
  completed_at: null,
  created_by: "user",
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
  sort_order: 0,
};

const makeTodo = (overrides: Partial<TodoRecord> = {}): TodoRecord => ({
  id: 1,
  chat_id: null,
  title: "Task",
  description: null,
  status: "pending",
  priority: "medium",
  due_at: null,
  notify_at: null,
  notified: 0,
  completed_at: null,
  created_by: "user",
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
  sort_order: 0,
  ...overrides,
});

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
});

describe("TodoForm", () => {
  // Mocks Date alone — setTimeout stays real, so userEvent's inter-key delays
  // and waitFor's polling still work without an advanceTimers bridge.
  beforeEach(() => {
    vi.setSystemTime(NOW);
    rpcCreateTodo.mockResolvedValue(99);
    rpcUpdateTodo.mockResolvedValue(todo);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an existing due date as local wall-clock time", () => {
    render(<TodoForm todo={todo} onClose={() => {}} />);
    // Not the UTC reading of the same instant: the control is datetime-local.
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-08-20T15:30");
  });

  it("round-trips a due date through the picker without shifting it", async () => {
    const user = userEvent.setup();
    render(<TodoForm todo={todo} onClose={() => {}} />);

    // Nudge only the minutes, the way a user would in the picker. The whole
    // displayed string round-trips through onChange, so while the field was
    // rendered as UTC but parsed back as local, changing 30 → 45 also moved
    // the task by the timezone offset — hours the user never touched.
    const due = screen.getByLabelText("Due date") as HTMLInputElement;
    fireEvent.change(due, {
      target: { value: due.value.replace(/:\d\d$/, ":45") },
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(rpcUpdateTodo).toHaveBeenCalled());
    // 15:45 local — the 15:30 they were shown, with only the minutes moved.
    expect(rpcUpdateTodo.mock.calls[0][0].fields.due_at).toBe(
      toSeconds(asEpochMillis(new Date(2026, 7, 20, 15, 45, 0, 0).getTime())),
    );
  });

  it("sends the picked local time when creating", async () => {
    const user = userEvent.setup();
    render(<TodoForm onClose={() => {}} />);

    await user.type(screen.getByLabelText("Title"), "Book the flight");
    await user.type(screen.getByLabelText("Due date"), "2026-08-20T15:30");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(rpcCreateTodo).toHaveBeenCalled());
    const input = rpcCreateTodo.mock.calls[0][0];
    expect(input.title).toBe("Book the flight");
    expect(input.due_at).toBe(DUE);
    expect(new Date(input.due_at! * 1000).getHours()).toBe(15);
  });

  it("leaves an empty date field null rather than NaN", async () => {
    const user = userEvent.setup();
    render(<TodoForm onClose={() => {}} />);

    await user.type(screen.getByLabelText("Title"), "No date");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(rpcCreateTodo).toHaveBeenCalled());
    expect(rpcCreateTodo.mock.calls[0][0].due_at).toBeNull();
    expect(rpcCreateTodo.mock.calls[0][0].notify_at).toBeNull();
  });

  it("does not submit a blank title", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TodoForm onClose={onClose} />);

    await user.type(screen.getByLabelText("Title"), "   ");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(rpcCreateTodo).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TodoForm onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens with the title focused, not the close button", () => {
    render(<TodoForm onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByLabelText("Title"));
  });

  // Regression: the panel closed before the write resolved, so a failed save
  // took the user's text with it.
  it("stays open and reports the error when the save fails", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    rpcCreateTodo.mockRejectedValueOnce(new Error("database is locked"));
    render(<TodoForm onClose={onClose} />);

    await user.type(screen.getByLabelText("Title"), "Book the flight");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "database is locked",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("Book the flight");
  });

  it("asks before discarding edits when closing a dirty form", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TodoForm onClose={onClose} />);

    await user.type(screen.getByLabelText("Title"), "Half-written");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes an untouched form without asking", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TodoForm onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  // Regression: a text-selection drag that started in the panel and ended on
  // the backdrop reported the backdrop as the click target and closed the form.
  it("ignores a click that was released on the backdrop but began inside", async () => {
    const onClose = vi.fn();
    render(<TodoForm onClose={onClose} />);
    const backdrop = screen.getByRole("dialog");
    const panel = backdrop.querySelector("form")!;

    fireEvent.mouseDown(panel);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses to create a task with a due date in the past", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TodoForm onClose={onClose} />);

    await user.type(screen.getByLabelText("Title"), "Already late");
    await user.type(screen.getByLabelText("Due date"), "2020-01-01T09:00");
    expect(
      await screen.findByText(/Due date is in the past/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(rpcCreateTodo).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Due date")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("refuses to create a task with a reminder in the past", async () => {
    const user = userEvent.setup();
    render(<TodoForm onClose={() => {}} />);

    await user.type(screen.getByLabelText("Title"), "Already late");
    await user.type(screen.getByLabelText("Remind me"), "2020-01-01T09:00");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText(/Reminder is in the past/)).toBeInTheDocument();
    expect(rpcCreateTodo).not.toHaveBeenCalled();
  });

  // Regression: the date problem was reported both per-field and in the
  // general "Could not save" slot. Fixing the date cleared the field message
  // but left the general one stranded on screen.
  it("leaves no stale error behind once the date is corrected", async () => {
    const user = userEvent.setup();
    render(<TodoForm onClose={() => {}} />);

    await user.type(screen.getByLabelText("Title"), "Ping");
    await user.type(screen.getByLabelText("Remind me"), "2020-01-01T09:00");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText(/Reminder is in the past/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Remind me"));
    await user.type(screen.getByLabelText("Remind me"), "2030-01-01T09:00");

    expect(screen.queryByText(/is in the past/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument();
  });

  it("creates once the date is moved into the future", async () => {
    const user = userEvent.setup();
    render(<TodoForm onClose={() => {}} />);
    const future = new Date(Date.now() + 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const value = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(
      future.getDate(),
    )}T09:00`;

    await user.type(screen.getByLabelText("Title"), "Later");
    await user.type(screen.getByLabelText("Due date"), "2020-01-01T09:00");
    await user.clear(screen.getByLabelText("Due date"));
    await user.type(screen.getByLabelText("Due date"), value);

    expect(screen.queryByText(/is in the past/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(rpcCreateTodo).toHaveBeenCalled());
  });

  // The four year-old car tasks in the real database have to stay editable.
  it("lets an already-overdue task be edited without rescheduling it", async () => {
    const user = userEvent.setup();
    const stale = {
      ...todo,
      due_at: toSeconds(asEpochMillis(new Date(2025, 7, 17, 9, 30).getTime())),
      notify_at: toSeconds(
        asEpochMillis(new Date(2025, 7, 17, 9, 0).getTime()),
      ),
    };
    render(<TodoForm todo={stale} onClose={() => {}} />);

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Renew the domain again");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByText(/is in the past/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(rpcUpdateTodo).toHaveBeenCalledWith({
        id: stale.id,
        fields: expect.objectContaining({ title: "Renew the domain again" }),
      }),
    );
  });

  it("blocks moving an overdue task's date further into the past", async () => {
    const user = userEvent.setup();
    const stale = {
      ...todo,
      due_at: toSeconds(asEpochMillis(new Date(2025, 7, 17, 9, 30).getTime())),
    };
    render(<TodoForm todo={stale} onClose={() => {}} />);

    await user.clear(screen.getByLabelText("Due date"));
    await user.type(screen.getByLabelText("Due date"), "2020-01-01T09:00");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText(/Due date is in the past/)).toBeInTheDocument();
    expect(rpcUpdateTodo).not.toHaveBeenCalled();
  });
});

describe("useTodoStore", () => {
  it("clamps the sidebar width to its bounds", () => {
    const { setSidebarWidth } = useTodoStore.getState();
    setSidebarWidth(10);
    expect(useTodoStore.getState().sidebarWidth).toBe(240);
    setSidebarWidth(9999);
    expect(useTodoStore.getState().sidebarWidth).toBe(480);
    setSidebarWidth(320);
    expect(useTodoStore.getState().sidebarWidth).toBe(320);
  });

  it("hands out a pending prompt exactly once", () => {
    useTodoStore.setState({ pendingPrompt: "Let's work on this todo:" });
    expect(useTodoStore.getState().consumePendingPrompt()).toBe(
      "Let's work on this todo:",
    );
    expect(useTodoStore.getState().consumePendingPrompt()).toBeNull();
  });

  it("optimistically reorders within the local list and persists the order", async () => {
    const due = toSeconds(asEpochMillis(Date.now() + 86_400_000));
    useTodoStore.setState({
      todos: [
        makeTodo({ id: 1, title: "A", due_at: due, sort_order: 0 }),
        makeTodo({ id: 2, title: "B", due_at: due, sort_order: 1 }),
        makeTodo({ id: 3, title: "C", due_at: due, sort_order: 2 }),
      ],
    });
    await useTodoStore.getState().reorderTodos([3, 1, 2]);
    expect(rpcReorderTodos).toHaveBeenCalledWith({ order: [3, 1, 2] });
    expect(useTodoStore.getState().todos.map((t) => t.id)).toEqual([3, 1, 2]);
  });

  // A manual order that disagrees with the due dates has to survive the local
  // re-sort too, or the row snaps back before the write even lands.
  it("keeps a reorder that contradicts the due dates", async () => {
    const now = toSeconds(asEpochMillis(Date.now()));
    useTodoStore.setState({
      todos: [
        makeTodo({ id: 1, title: "morning", due_at: now + 3600 }),
        makeTodo({ id: 2, title: "evening", due_at: now + 36_000 }),
      ],
    });
    await useTodoStore.getState().reorderTodos([2, 1]);
    expect(useTodoStore.getState().todos.map((t) => t.id)).toEqual([2, 1]);
  });

  it("holds a delete open for undo, then commits it", async () => {
    vi.useFakeTimers();
    try {
      useTodoStore.setState({
        todos: [makeTodo({ id: 1 })],
        pendingDelete: null,
      });

      useTodoStore.getState().deleteTodo(1);
      expect(useTodoStore.getState().todos).toHaveLength(0);
      expect(rpcDeleteTodo).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 10);
      expect(rpcDeleteTodo).toHaveBeenCalledWith({ id: 1 });
      expect(useTodoStore.getState().pendingDelete).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the original row on undo without writing", async () => {
    vi.useFakeTimers();
    try {
      useTodoStore.setState({
        todos: [makeTodo({ id: 1, title: "Renew the domain", chat_id: 9 })],
        pendingDelete: null,
      });

      useTodoStore.getState().deleteTodo(1);
      useTodoStore.getState().undoDelete();
      await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 10);

      expect(rpcDeleteTodo).not.toHaveBeenCalled();
      // The same row, not a copy — id and chat link intact.
      expect(useTodoStore.getState().todos).toEqual([
        expect.objectContaining({ id: 1, chat_id: 9 }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not resurrect a pending delete when the list refreshes", async () => {
    vi.useFakeTimers();
    try {
      const row = makeTodo({ id: 1 });
      useTodoStore.setState({ todos: [row], pendingDelete: null });
      rpcListTodos.mockResolvedValueOnce([row] as never);

      useTodoStore.getState().deleteTodo(1);
      await useTodoStore.getState().loadTodos();
      expect(useTodoStore.getState().todos).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // A filter change and a todos:changed refresh race; the slower response must
  // not overwrite the newer list.
  it("ignores a list response that a newer request has superseded", async () => {
    const stale = makeTodo({ id: 1, title: "stale" });
    const fresh = makeTodo({ id: 2, title: "fresh" });
    const releaseStale: { fn: () => void } = { fn: () => {} };

    rpcListTodos.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseStale.fn = () => resolve([stale] as never);
        }) as never,
    );
    rpcListTodos.mockResolvedValueOnce([fresh] as never);

    const first = useTodoStore.getState().loadTodos();
    const second = useTodoStore.getState().loadTodos();
    await second;
    releaseStale.fn();
    await first;

    expect(useTodoStore.getState().todos.map((t) => t.id)).toEqual([2]);
  });
});
