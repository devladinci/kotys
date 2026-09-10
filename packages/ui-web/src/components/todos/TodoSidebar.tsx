import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AlertTriangle,
  CalendarClock,
  Inbox,
  ListTodo,
  Plus,
  Undo2,
  X,
} from "lucide-react";
import type { TodoRecord } from "@kotys/contracts";
import { useTodoStore, DEFAULT_SIDEBAR_WIDTH } from "@kotys/core";
import PomodoroPanel from "../pomodoro/PomodoroPanel";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  dueLabelFor,
  exactLabelFor,
  groupFor,
  isOverdue,
  reminderLabelFor,
  type TodoGroup,
} from "@kotys/core";
import TodoItem from "./TodoItem";
import TodoForm from "./TodoForm";

type FilterStatus = "all" | "pending" | "completed";

const FILTERS: FilterStatus[] = ["pending", "completed", "all"];

const OVERDUE_TICK_MS = 30_000;
const RESIZE_KEY_STEP = 16;

interface Row {
  todo: TodoRecord;
  dueLabel: string | null;
  dueTitle: string | null;
  remindLabel: string | null;
  remindTitle: string | null;
  overdue: boolean;
}

function TodoSidebarBase() {
  const sidebarOpen = useTodoStore((s) => s.sidebarOpen);
  const sidebarWidth = useTodoStore((s) => s.sidebarWidth);
  const setSidebarWidth = useTodoStore((s) => s.setSidebarWidth);
  const todos = useTodoStore((s) => s.todos);
  const loading = useTodoStore((s) => s.loading);
  const filter = useTodoStore((s) => s.filter);
  const setFilter = useTodoStore((s) => s.setFilter);
  const reorderTodos = useTodoStore((s) => s.reorderTodos);
  const error = useTodoStore((s) => s.error);
  const setError = useTodoStore((s) => s.setError);
  const pendingDelete = useTodoStore((s) => s.pendingDelete);
  const undoDelete = useTodoStore((s) => s.undoDelete);
  const focusTodoId = useTodoStore((s) => s.focusTodoId);
  const setFocusTodoId = useTodoStore((s) => s.setFocusTodoId);
  const [showForm, setShowForm] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), OVERDUE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const grouped = useMemo(() => {
    const buckets = new Map<TodoGroup, Row[]>();
    for (const todo of todos) {
      const key = groupFor(todo, now);
      const row: Row = {
        todo,
        dueLabel: dueLabelFor(todo, now),
        dueTitle: todo.due_at === null ? null : exactLabelFor(todo.due_at),
        remindLabel:
          todo.notify_at === null
            ? null
            : reminderLabelFor(todo.notify_at, now, todo.due_at),
        remindTitle:
          todo.notify_at === null
            ? null
            : `Reminder · ${exactLabelFor(todo.notify_at)}`,
        overdue: isOverdue(todo, now),
      };
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    return buckets;
  }, [todos, now]);

  // The "N" shortcut used to live on the <aside>, which is never focused when
  // the panel is opened by shortcut — so the key went to the chat input
  // instead. Listening on the document makes the advertised shortcut real.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setShowForm(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // A clicked reminder notification asks for a specific task; bring it into
  // view and give it focus so the row shortcuts work straight away.
  useEffect(() => {
    if (focusTodoId === null) return;
    const el = document.querySelector<HTMLElement>(
      `[data-todo-row="${focusTodoId}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.focus();
      setFocusTodoId(null);
    } else if (!loading) {
      setFocusTodoId(null);
    }
  }, [focusTodoId, todos, loading, setFocusTodoId]);

  const stopResize = useCallback(() => {
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  // Pointer capture rather than window listeners: releasing the mouse outside
  // the window used to leave the sidebar stuck in resize mode.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      setSidebarWidth(window.innerWidth - e.clientX);
    },
    [dragging, setSidebarWidth],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      handleRef.current?.releasePointerCapture(e.pointerId);
      stopResize();
      setSidebarWidth(window.innerWidth - e.clientX, true);
    },
    [dragging, setSidebarWidth, stopResize],
  );

  const onHandleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSidebarWidth(sidebarWidth + RESIZE_KEY_STEP, true);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSidebarWidth(sidebarWidth - RESIZE_KEY_STEP, true);
      }
    },
    [sidebarWidth, setSidebarWidth],
  );

  const handleDragStart = useCallback((id: number) => {
    setDragId(id);
  }, []);

  const handleDragEnter = useCallback((id: number) => {
    setDragOverId(id);
  }, []);

  // sort_order is global, so the whole visible list is renumbered — sending
  // only the dragged group's ids would collide with every other group.
  const handleDragEnd = useCallback(() => {
    if (dragId !== null && dragOverId !== null && dragId !== dragOverId) {
      const dragged = todos.find((t) => t.id === dragId);
      const target = todos.find((t) => t.id === dragOverId);
      if (
        dragged &&
        target &&
        groupFor(dragged, now) === groupFor(target, now)
      ) {
        const fromIdx = todos.findIndex((t) => t.id === dragId);
        const toIdx = todos.findIndex((t) => t.id === dragOverId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const next = [...todos];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          void reorderTodos(next.map((t) => t.id));
        }
      }
    }
    setDragId(null);
    setDragOverId(null);
  }, [dragId, dragOverId, todos, now, reorderTodos]);

  const filtered = filter.status !== "all" || filter.hasDueDate;

  if (!sidebarOpen) return null;

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a focusable role="separator" is the ARIA window-splitter pattern: arrow keys are the keyboard alternative to dragging */}
      <div
        ref={handleRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={stopResize}
        onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH, true)}
        onKeyDown={onHandleKey}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tasks panel"
        aria-valuenow={sidebarWidth}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ditto: the splitter has to be reachable by keyboard
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        // The after:* inset widens the grab area to 16px without widening the
        // visible seam — a 4px target is hard to hit.
        className={`relative w-1 cursor-col-resize flex-shrink-0 transition outline-none focus-visible:bg-accent/60 after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 after:content-[''] ${
          dragging ? "bg-accent/40" : "bg-transparent hover:bg-accent/30"
        }`}
      />
      <aside
        aria-label="Tasks"
        className="bg-bg border-l border-border flex flex-col flex-shrink-0"
        style={{ width: sidebarWidth } as CSSProperties}
      >
        {/* Focus is the rail's first row: it sits in the draggable strip that
            lines up with the chat header, and it is the only collapsible
            section. The task list is what this rail is for, so it is a plain
            header over content that always fills the remaining space —
            collapsing it only ever bought an empty panel. */}
        <PomodoroPanel />

        <div className="px-2.5 pt-1.5 pb-1.5 flex items-center gap-1">
          <div className="flex items-center gap-2 flex-1 min-w-0 text-[13px] font-medium">
            <ListTodo size={14} className="text-text-muted" />
            Tasks
            {todos.length > 0 && (
              <span className="text-[11px] font-normal text-text-muted/60 tabular-nums">
                {todos.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowForm(true)}
            aria-label="New task"
            title="New task (N)"
            className="p-1.5 rounded-md hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
          >
            <Plus size={15} />
          </button>
        </div>

        {/* One row of chrome instead of two: the due-date filter was a whole
            extra line for a single checkbox. */}
        <div className="px-2.5 pb-2 flex flex-wrap gap-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter({ status: f })}
              aria-pressed={filter.status === f}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors duration-100 capitalize ${
                filter.status === f
                  ? "text-accent bg-accent/10"
                  : "text-text-muted hover:text-text hover:bg-surface-2/70"
              }`}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilter({ hasDueDate: !filter.hasDueDate })}
            aria-pressed={filter.hasDueDate}
            title="Only tasks with a due date"
            className={`text-[11px] px-2 py-0.5 rounded transition-colors duration-100 inline-flex items-center gap-1 ml-auto ${
              filter.hasDueDate
                ? "text-accent bg-accent/10"
                : "text-text-muted hover:text-text hover:bg-surface-2/70"
            }`}
          >
            <CalendarClock size={11} />
            Dated
          </button>
        </div>

        {error !== null && (
          <div
            role="alert"
            className="mx-2.5 mb-2 flex items-start gap-2 rounded-md border border-red-400/40 bg-red-400/10 px-2.5 py-1.5 text-[11px] text-red-300"
          >
            <AlertTriangle size={12} className="mt-px flex-shrink-0" />
            <span className="flex-1 break-words">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="text-red-300/70 hover:text-red-200"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2">
          {loading && todos.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-text-muted">Loading…</div>
          ) : todos.length === 0 ? (
            <div className="px-3 py-8 text-center leading-relaxed">
              <Inbox
                size={24}
                className="mx-auto mb-2.5 text-text-muted/40"
                aria-hidden="true"
              />
              {filtered ? (
                <>
                  <div className="text-sm text-text-muted">
                    No tasks match this filter
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFilter({ status: "pending", hasDueDate: false })
                    }
                    className="mt-2 text-xs text-accent dark:text-blue-400 hover:text-accent-hover"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <div className="text-sm text-text-muted">No tasks yet</div>
                  <div className="text-xs text-text-muted/70 mt-1">
                    Press <kbd className="px-1 rounded bg-surface-2">N</kbd> or
                    click + to create one.
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {GROUP_ORDER.map((key) => {
                const items = grouped.get(key);
                if (!items || items.length === 0) return null;
                const isOverdueGroup = key === "overdue";
                const headingId = `todo-group-${key}`;
                return (
                  <section key={key} className="space-y-1.5">
                    <h3
                      id={headingId}
                      className="flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted/70"
                    >
                      {isOverdueGroup ? (
                        <CalendarClock size={11} className="text-red-400" />
                      ) : null}
                      <span className={isOverdueGroup ? "text-red-400" : ""}>
                        {GROUP_LABELS[key]}
                      </span>
                      <span className="text-text-muted/40">{items.length}</span>
                    </h3>
                    <div
                      role="list"
                      aria-labelledby={headingId}
                      className="space-y-1.5"
                    >
                      {items.map((row) => (
                        <TodoItem
                          key={row.todo.id}
                          todo={row.todo}
                          dueLabel={row.dueLabel}
                          dueTitle={row.dueTitle}
                          remindLabel={row.remindLabel}
                          remindTitle={row.remindTitle}
                          overdue={row.overdue}
                          onDragStart={handleDragStart}
                          onDragEnter={handleDragEnter}
                          onDragEnd={handleDragEnd}
                          dragging={dragId === row.todo.id}
                          dragOver={dragOverId === row.todo.id}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {pendingDelete !== null && (
          <div className="mx-2.5 mb-2.5 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs">
            <span className="flex-1 truncate text-text-muted">
              Deleted “{pendingDelete.todo.title}”
            </span>
            <button
              type="button"
              onClick={undoDelete}
              className="inline-flex items-center gap-1 font-medium text-accent dark:text-blue-400 hover:text-accent-hover"
            >
              <Undo2 size={12} />
              Undo
            </button>
          </div>
        )}

        {showForm && <TodoForm onClose={() => setShowForm(false)} />}
      </aside>
    </>
  );
}

const TodoSidebar = memo(TodoSidebarBase);
export default TodoSidebar;
