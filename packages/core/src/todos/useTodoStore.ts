import { create } from "zustand";
import type { CreateTodoInput, TodoRecord } from "@kotys/contracts";
import { asEpochSeconds } from "@kotys/contracts";
import { getRpc, getSocket } from "../shared/clients.js";
import { useAppStore } from "../shared/useAppStore.js";

type TodoFilterStatus = "all" | "pending" | "completed";

interface TodoFilter {
  status: TodoFilterStatus;
  hasDueDate: boolean;
}

interface PendingDelete {
  todo: TodoRecord;
  timer: ReturnType<typeof setTimeout>;
}

interface TodoState {
  todos: TodoRecord[];
  sidebarOpen: boolean;
  sidebarWidth: number;
  filter: TodoFilter;
  loading: boolean;
  error: string | null;
  /** Set while a delete is undoable; the row is already hidden. */
  pendingDelete: PendingDelete | null;
  /** Row to scroll to and focus — set when a reminder notification is clicked. */
  focusTodoId: number | null;

  loadTodos: () => Promise<void>;
  hydrateSidebar: () => Promise<void>;
  createTodo: (input: CreateTodoInput) => Promise<void>;
  updateTodo: (id: number, fields: Partial<TodoRecord>) => Promise<void>;
  deleteTodo: (id: number) => void;
  undoDelete: () => void;
  toggleStatus: (id: number) => Promise<void>;
  reorderTodos: (order: number[]) => Promise<void>;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number, persist?: boolean) => void;
  setFilter: (filter: Partial<TodoFilter>) => void;
  setError: (error: string | null) => void;
  setFocusTodoId: (id: number | null) => void;
  chatAboutTodo: (todoId: number) => Promise<number | null>;
}

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 480;
export const DEFAULT_SIDEBAR_WIDTH = 288;

const OPEN_SETTING = "todos_sidebar_open";
const WIDTH_SETTING = "todos_sidebar_width";

/** How long a deleted task can be brought back before the delete is committed. */
export const UNDO_WINDOW_MS = 6000;

/** Matches the sparse step the main process writes (see TODO_SORT_STEP). */
const SORT_STEP = 1000;

const message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// Mirrors the ORDER BY in listTodos, so an optimistic insert lands exactly
// where the next read from SQLite would put it.
const compareTodos = (a: TodoRecord, b: TodoRecord): number =>
  Number(a.due_at === null) - Number(b.due_at === null) ||
  a.sort_order - b.sort_order ||
  (a.due_at ?? 0) - (b.due_at ?? 0) ||
  b.created_at - a.created_at;

const matchesFilter = (t: TodoRecord, f: TodoFilter): boolean =>
  (f.status === "all" || t.status === f.status) &&
  (!f.hasDueDate || t.due_at !== null);

// Guards against an out-of-order response: a filter change and a `todos:changed`
// refresh race each other, and the slower request must not overwrite the newer
// list.
let loadSeq = 0;

export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  sidebarOpen: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  filter: { status: "pending", hasDueDate: false },
  loading: false,
  error: null,
  pendingDelete: null,
  focusTodoId: null,

  loadTodos: async () => {
    const { filter } = get();
    const seq = ++loadSeq;
    set({ loading: true });
    try {
      const todos = await getRpc().todos.list({
        status: filter.status !== "all" ? filter.status : undefined,
        has_due_date: filter.hasDueDate || undefined,
      });
      if (seq !== loadSeq) return;
      // A task waiting out its undo period is already gone from the user's
      // view; a refresh must not resurrect it.
      const undoing = get().pendingDelete?.todo.id;
      set({
        todos:
          undoing === undefined ? todos : todos.filter((t) => t.id !== undoing),
        error: null,
      });
    } catch (err) {
      if (seq === loadSeq) set({ error: message(err) });
    } finally {
      if (seq === loadSeq) set({ loading: false });
    }
  },

  hydrateSidebar: async () => {
    try {
      const rpc = getRpc();
      const [open, width] = await Promise.all([
        rpc.settings.get({ key: OPEN_SETTING }),
        rpc.settings.get({ key: WIDTH_SETTING }),
      ]);
      const parsed = width.value === null ? NaN : Number(width.value);
      set({
        sidebarOpen: open.value === "true",
        sidebarWidth: Number.isFinite(parsed)
          ? Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed))
          : DEFAULT_SIDEBAR_WIDTH,
      });
    } catch {
      // A missing or unreadable preference is not worth surfacing; the
      // defaults are fine.
    }
  },

  createTodo: async (input) => {
    try {
      const id = await getRpc().todos.create(input);
      const now = asEpochSeconds(Math.floor(Date.now() / 1000));
      const maxSort = get().todos.reduce(
        (m, t) => Math.max(m, t.sort_order),
        0,
      );
      const created: TodoRecord = {
        id,
        chat_id: input.chat_id ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "pending",
        priority: input.priority ?? "medium",
        due_at: input.due_at ?? null,
        notify_at: input.notify_at ?? null,
        notified: 0,
        completed_at: null,
        created_by: input.created_by ?? "user",
        created_at: now,
        updated_at: now,
        sort_order: maxSort + SORT_STEP,
      };
      if (matchesFilter(created, get().filter)) {
        set((s) => ({ todos: [...s.todos, created].sort(compareTodos) }));
      }
      set({ error: null });
    } catch (err) {
      set({ error: message(err) });
      throw err;
    }
  },

  updateTodo: async (id, fields) => {
    const prev = get().todos;
    set({
      todos: prev
        .map((t) => (t.id === id ? { ...t, ...fields } : t))
        .sort(compareTodos),
    });
    try {
      const saved = await getRpc().todos.update({ id, fields });
      if (saved) {
        set((s) => ({
          todos: s.todos
            .map((t) => (t.id === id ? saved : t))
            .filter((t) => matchesFilter(t, s.filter))
            .sort(compareTodos),
        }));
      }
      set({ error: null });
    } catch (err) {
      set({ todos: prev, error: message(err) });
      throw err;
    }
  },

  // Hides the row immediately and holds the delete open for UNDO_WINDOW_MS.
  // Nothing leaves the client until the period closes, so undo restores the
  // original row — id, linked chat and all — rather than a copy of it.
  deleteTodo: (id) => {
    const existing = get().pendingDelete;
    if (existing) {
      clearTimeout(existing.timer);
      void commitDelete(existing.todo, set, get);
    }
    const todo = get().todos.find((t) => t.id === id);
    if (!todo) return;
    const timer = setTimeout(() => {
      const current = get().pendingDelete;
      if (current?.todo.id !== id) return;
      set({ pendingDelete: null });
      void commitDelete(todo, set, get);
    }, UNDO_WINDOW_MS);
    set((s) => ({
      todos: s.todos.filter((t) => t.id !== id),
      pendingDelete: { todo, timer },
    }));
  },

  undoDelete: () => {
    const pending = get().pendingDelete;
    if (!pending) return;
    clearTimeout(pending.timer);
    set((s) => ({
      todos: [...s.todos, pending.todo].sort(compareTodos),
      pendingDelete: null,
    }));
  },

  toggleStatus: async (id) => {
    const prev = get().todos;
    const todo = prev.find((t) => t.id === id);
    if (!todo) return;
    const completed = todo.status === "completed";
    const next: TodoRecord = {
      ...todo,
      status: completed ? "pending" : "completed",
      completed_at: completed
        ? null
        : asEpochSeconds(Math.floor(Date.now() / 1000)),
    };
    set((s) => ({
      todos: s.todos
        .map((t) => (t.id === id ? next : t))
        .filter((t) => matchesFilter(t, s.filter))
        .sort(compareTodos),
    }));
    try {
      await getRpc().todos.toggle({ id });
      set({ error: null });
    } catch (err) {
      set({ todos: prev, error: message(err) });
    }
  },

  reorderTodos: async (order) => {
    const prev = get().todos;
    const rank = new Map(order.map((id, i) => [id, i]));
    set({
      todos: [...prev]
        .sort(
          (a, b) =>
            (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((t, i) => ({ ...t, sort_order: (i + 1) * SORT_STEP })),
    });
    try {
      await getRpc().todos.reorder({ order });
    } catch (err) {
      set({ todos: prev, error: message(err) });
    }
  },

  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
    void getRpc()
      .settings.set({ key: OPEN_SETTING, value: String(open) })
      .catch(() => undefined);
  },

  setSidebarWidth: (width, persist = false) => {
    const clamped = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, width),
    );
    set({ sidebarWidth: clamped });
    // Only on drag end — writing on every pointer move would hammer the DB.
    if (persist) {
      void getRpc()
        .settings.set({ key: WIDTH_SETTING, value: String(clamped) })
        .catch(() => undefined);
    }
  },

  setFilter: (filter) => {
    set((state) => ({ filter: { ...state.filter, ...filter } }));
    void get().loadTodos();
  },

  setError: (error) => set({ error }),

  setFocusTodoId: (id) => set({ focusTodoId: id }),

  chatAboutTodo: async (todoId) => {
    try {
      const result = await getRpc().todos.chatAbout({
        todoId,
        model: useAppStore.getState().defaultModel,
      });
      // The chat row (and its prompt message) are created on the server, so
      // the client's chat list has to be told to reload — without this the
      // chat is missing from the sidebar and `activeChat` stays undefined.
      useAppStore.getState().bumpChatsVersion();
      useAppStore.getState().setActiveChatId(result.chat_id);
      set({ sidebarOpen: false, error: null });
      return result.chat_id;
    } catch (err) {
      set({ error: message(err) });
      return null;
    }
  },
}));

type Setter = (
  partial: Partial<TodoState> | ((state: TodoState) => Partial<TodoState>),
) => void;

async function commitDelete(
  todo: TodoRecord,
  set: Setter,
  get: () => TodoState,
): Promise<void> {
  try {
    await getRpc().todos.remove({ id: todo.id });
  } catch (err) {
    // The undo period has closed, so the row comes back with an explanation
    // rather than vanishing on a failure the user never saw.
    if (!get().todos.some((t) => t.id === todo.id)) {
      set((s) => ({ todos: [...s.todos, todo].sort(compareTodos) }));
    }
    set({ error: message(err) });
  }
}

let subscribed = false;
export const subscribeTodoChanges = () => {
  if (subscribed) return;
  subscribed = true;
  const socket = getSocket();
  socket.on((msg) => {
    if (msg.type === "todos:changed") {
      void useTodoStore.getState().loadTodos();
    }
    if (msg.type === "todos:open") {
      const s = useTodoStore.getState();
      s.setSidebarOpen(true);
      s.setFocusTodoId(msg.payload.todoId);
      void s.loadTodos();
    }
  });
};
