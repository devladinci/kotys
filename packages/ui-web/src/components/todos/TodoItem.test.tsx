import {
  describe,
  expect,
  it,
  beforeEach,
  vi,
  type MockedFunction,
} from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import type { TodoRecord } from "@kotys/contracts";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { rpc, initTestClients } = await import("../../test/mocks/rpc");

const TodoItem = (await import("./TodoItem")).default;
const { useTodoStore } = await import("@kotys/core");

const rpcUpdateTodo = rpc.todos.update as MockedFunction<
  typeof rpc.todos.update
>;
const rpcDeleteTodo = rpc.todos.remove as MockedFunction<
  typeof rpc.todos.remove
>;
const rpcToggleTodoStatus = rpc.todos.toggle as MockedFunction<
  typeof rpc.todos.toggle
>;
const rpcTodosChatAbout = rpc.todos.chatAbout as MockedFunction<
  typeof rpc.todos.chatAbout
>;

const makeTodo = (overrides: Partial<TodoRecord> = {}): TodoRecord => ({
  id: 1,
  chat_id: null,
  title: "Renew the domain",
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
  sort_order: 1000,
  ...overrides,
});

const renderItem = (
  overrides: Partial<TodoRecord> = {},
  props: {
    dueLabel?: string | null;
    remindLabel?: string | null;
    overdue?: boolean;
  } = {},
) => {
  const todo = makeTodo(overrides);
  useTodoStore.setState({ todos: [todo] });
  return render(
    <MemoryRouter>
      <TodoItem
        todo={todo}
        dueLabel={props.dueLabel ?? null}
        dueTitle={null}
        remindLabel={props.remindLabel ?? null}
        remindTitle={null}
        overdue={props.overdue ?? false}
      />
    </MemoryRouter>,
  );
};

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  rpcUpdateTodo.mockResolvedValue(makeTodo() as never);
  useTodoStore.setState({ todos: [], pendingDelete: null, error: null });
});

describe("TodoItem", () => {
  it("renders the title and priority badge", () => {
    renderItem({ priority: "high" });
    expect(screen.getByText("Renew the domain")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("does not badge the default medium priority", () => {
    renderItem({ priority: "medium" });
    expect(screen.queryByText("medium")).not.toBeInTheDocument();
  });

  it("shows the due date once, as a relative label", () => {
    renderItem({ due_at: Date.now() + 3_600_000 }, { dueLabel: "Today 15:30" });
    expect(screen.getAllByText("Today 15:30")).toHaveLength(1);
  });

  it("toggles status on checkbox change", () => {
    renderItem();
    fireEvent.click(screen.getByLabelText(/Toggle/));
    expect(rpcToggleTodoStatus).toHaveBeenCalledWith({ id: 1 });
  });

  it("deletes on Delete key when the row is focused", async () => {
    renderItem();
    const row = screen.getByRole("listitem");
    row.focus();
    fireEvent.keyDown(row, { key: "Delete" });
    // The row goes immediately, but the write is held open for undo.
    expect(useTodoStore.getState().todos).toHaveLength(0);
    expect(useTodoStore.getState().pendingDelete?.todo.id).toBe(1);
    useTodoStore.getState().undoDelete();
    await waitFor(() => expect(rpcDeleteTodo).not.toHaveBeenCalled());
    expect(useTodoStore.getState().todos).toHaveLength(1);
  });

  it("ignores Backspace, which is the browser's 'back' reflex", () => {
    renderItem();
    const row = screen.getByRole("listitem");
    row.focus();
    fireEvent.keyDown(row, { key: "Backspace" });
    expect(useTodoStore.getState().pendingDelete).toBeNull();
  });

  // Regression: onRootKey handled every key that bubbled up from the row and
  // called preventDefault(), which cancelled the focused button's own Enter
  // activation — so Enter on any control silently completed the task instead.
  it("does not toggle when Enter is pressed on a control inside the row", async () => {
    const user = userEvent.setup();
    renderItem();
    screen.getByLabelText(/Chat about/).focus();
    await user.keyboard("{Enter}");
    expect(rpcToggleTodoStatus).not.toHaveBeenCalled();
    expect(rpcTodosChatAbout).toHaveBeenCalledWith(
      expect.objectContaining({ todoId: 1 }),
    );
  });

  it("starts a rename on Enter over the title without also toggling", async () => {
    const user = userEvent.setup();
    renderItem();
    screen.getByTitle("Double-click to rename").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Edit task title")).toBeInTheDocument();
    expect(rpcToggleTodoStatus).not.toHaveBeenCalled();
  });

  // Regression: `c` was matched without checking modifiers, so copying text
  // with a row focused opened a chat about the task.
  it("leaves Cmd+C and Ctrl+C alone", async () => {
    const user = userEvent.setup();
    renderItem();
    screen.getByRole("listitem").focus();
    await user.keyboard("{Meta>}c{/Meta}");
    await user.keyboard("{Control>}c{/Control}");
    expect(rpcTodosChatAbout).not.toHaveBeenCalled();
  });

  it("toggles on Enter when the row itself has focus", () => {
    renderItem();
    const row = screen.getByRole("listitem");
    row.focus();
    fireEvent.keyDown(row, { key: "Enter", target: row });
    expect(rpcToggleTodoStatus).toHaveBeenCalledWith({ id: 1 });
  });

  it("opens a chat on 'c' when the row itself has focus", () => {
    renderItem();
    const row = screen.getByRole("listitem");
    row.focus();
    fireEvent.keyDown(row, { key: "c" });
    expect(rpcTodosChatAbout).toHaveBeenCalledWith(
      expect.objectContaining({ todoId: 1 }),
    );
  });

  it("commits an inline rename on Enter and persists", async () => {
    const user = userEvent.setup();
    renderItem();
    await user.dblClick(screen.getByTitle("Double-click to rename"));
    const input = screen.getByLabelText("Edit task title") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "Renew the domain and SSL{Enter}");
    await waitFor(() =>
      expect(rpcUpdateTodo).toHaveBeenCalledWith({
        id: 1,
        fields: { title: "Renew the domain and SSL" },
      }),
    );
  });

  it("focuses the field when a rename starts on double-click", async () => {
    const user = userEvent.setup();
    renderItem();
    await user.dblClick(screen.getByTitle("Double-click to rename"));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText("Edit task title"),
      ),
    );
  });

  it("aborts an inline rename on Escape without persisting", async () => {
    const user = userEvent.setup();
    renderItem();
    await user.dblClick(screen.getByTitle("Double-click to rename"));
    const input = screen.getByLabelText("Edit task title") as HTMLInputElement;
    await user.type(input, "changed{Escape}");
    expect(rpcUpdateTodo).not.toHaveBeenCalled();
  });

  // jsdom has no layout, so the clamp measurement has to be stubbed. The
  // component asks the DOM whether the text actually overflowed rather than
  // guessing from a character count, which used to leave short-but-wrapping
  // descriptions rendered at full height with no way to collapse them.
  const withOverflow = (scrollH: number, clientH: number) => [
    vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(scrollH),
    vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(clientH),
  ];

  it("shows Read more when the description overflows its clamp", () => {
    const spies = withOverflow(120, 40);
    try {
      renderItem({
        description: "Short by character count, tall once wrapped",
      });
      expect(screen.getByText("Read more")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Read more"));
      expect(screen.queryByText("Read more")).not.toBeInTheDocument();
      expect(screen.getByText("Show less")).toBeInTheDocument();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it("offers no Read more when the description fits", () => {
    const spies = withOverflow(40, 40);
    try {
      renderItem({ description: "A".repeat(400) });
      expect(screen.queryByText("Read more")).not.toBeInTheDocument();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it("renders markdown in the description (bold text)", () => {
    renderItem({ description: "Do **important** work" });
    expect(screen.getByText("important")).toBeInTheDocument();
    expect(screen.getByText("important").tagName).toBe("STRONG");
  });

  // Regression: the description was run through DOMPurify *before* markdown
  // parsing, which stripped HTML-looking text out of code spans.
  it("keeps HTML-looking text inside a code span", () => {
    renderItem({ description: "Wrap it in `<div>` first" });
    expect(screen.getByText("<div>")).toBeInTheDocument();
  });
});
