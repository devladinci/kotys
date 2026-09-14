/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- per-row keyboard shortcuts (E/Del/C/Enter) need focus + key handling on the row */
import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  ChevronDown,
  GripVertical,
  MessageSquare,
  Pencil,
  Timer,
  Trash2,
} from "lucide-react";
import type { TodoRecord } from "@kotys/contracts";
import { useTodoStore } from "@kotys/core";
import { usePomodoroStore } from "@kotys/core";
import TodoForm from "./TodoForm";
import TodoMarkdown from "./TodoMarkdown";
import TodoPriorityBadge from "./TodoPriorityBadge";
import TodoDateChip from "./TodoDateChip";

interface IProps {
  todo: TodoRecord;
  /**
   * Date labels and the overdue flag are computed by the list, which already
   * owns the ticking clock. Passing primitives rather than `now` keeps the row
   * memoised between ticks — it only re-renders when its own label changes.
   */
  dueLabel: string | null;
  dueTitle: string | null;
  remindLabel: string | null;
  remindTitle: string | null;
  overdue: boolean;
  onDragStart?: (id: number) => void;
  onDragEnter?: (id: number) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  dragOver?: boolean;
}

function TodoItemBase({
  todo,
  dueLabel,
  dueTitle,
  remindLabel,
  remindTitle,
  overdue,
  onDragStart,
  onDragEnter,
  onDragEnd,
  dragging,
  dragOver,
}: IProps) {
  const toggleStatus = useTodoStore((s) => s.toggleStatus);
  const deleteTodo = useTodoStore((s) => s.deleteTodo);
  const updateTodo = useTodoStore((s) => s.updateTodo);
  const chatAboutTodo = useTodoStore((s) => s.chatAboutTodo);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [inlineTitle, setInlineTitle] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [truncated, setTruncated] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);

  const completed = todo.status === "completed";
  const hasMeta =
    dueLabel !== null ||
    remindLabel !== null ||
    todo.priority !== "medium" ||
    todo.created_by === "agent";

  // Measured, not guessed. The old character-count threshold let a short
  // description that happened to wrap over four lines render at full height
  // with no way to collapse it.
  useLayoutEffect(() => {
    if (expanded) return;
    const el = descRef.current;
    if (el) setTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [todo.description, expanded]);

  const startInlineEdit = useCallback(() => {
    setDraft(todo.title);
    setInlineTitle(true);
    requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
  }, [todo.title]);

  const commitTitle = useCallback(() => {
    const trimmed = draft.trim();
    setInlineTitle(false);
    if (trimmed && trimmed !== todo.title) {
      void updateTodo(todo.id, { title: trimmed }).catch(() => undefined);
    }
  }, [draft, todo.id, todo.title, updateTodo]);

  const cancelTitle = useCallback(() => {
    setInlineTitle(false);
    setDraft(todo.title);
  }, [todo.title]);

  const onTitleKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelTitle();
    }
  };

  // Ticking a task off under a "pending" filter removes the row from the DOM;
  // without this the focus ring falls back to <body> and keyboard navigation
  // starts over from the top of the app.
  const handleToggle = useCallback(() => {
    const root = rootRef.current;
    const hadFocus = !!root && root.contains(document.activeElement);
    const rows = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-todo-row]"));
    const index = root ? rows().indexOf(root) : -1;
    void toggleStatus(todo.id).then(() => {
      if (!hadFocus || index === -1) return;
      requestAnimationFrame(() => {
        if (root && document.body.contains(root)) {
          root.focus();
          return;
        }
        const remaining = rows();
        remaining[Math.min(index, remaining.length - 1)]?.focus();
      });
    });
  }, [toggleStatus, todo.id]);

  // The server persists the prompt as the first message, so the chat is
  // complete the moment it opens — the client only has to navigate to it.
  // Navigating (rather than letting a store field drive the view) is what
  // keeps the URL and the active chat from fighting each other.
  const openTodoChat = useCallback(() => {
    return chatAboutTodo(todo.id).then((chatId) => {
      if (chatId !== null) navigate(`/chat/${chatId}`);
    });
  }, [chatAboutTodo, navigate, todo.id]);

  const onRootKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Only when the row itself has focus. Without this the handler swallows
    // keys meant for the controls inside it — and because it calls
    // preventDefault(), Enter on a button ran this instead of the button.
    if (e.target !== e.currentTarget) return;
    if (inlineTitle || editing) return;
    // Cmd/Ctrl+C is copy, not "chat about this task".
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      handleToggle();
    } else if (e.key.toLowerCase() === "e") {
      e.preventDefault();
      setEditing(true);
    } else if (e.key === "Delete") {
      // Backspace deliberately left out: it is the muscle-memory "back" key
      // and this deletes a task.
      e.preventDefault();
      deleteTodo(todo.id);
    } else if (e.key.toLowerCase() === "c") {
      e.preventDefault();
      void openTodoChat();
    }
  };

  // Hidden controls stay in the layout so rows do not jump on hover, but they
  // must not be clickable while invisible.
  const actionVisibility =
    "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto";

  return (
    <div
      ref={rootRef}
      data-todo-row={todo.id}
      role="listitem"
      tabIndex={0}
      onKeyDown={onRootKey}
      draggable={!!onDragStart}
      onDragStart={() => onDragStart?.(todo.id)}
      onDragEnter={() => onDragEnter?.(todo.id)}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(e) => e.preventDefault()}
      // Colour-only transitions: the old lift-and-shadow made the whole list
      // twitch as the pointer crossed it.
      className={`group relative px-3 py-2.5 rounded-lg bg-surface border transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:border-accent/50 ${
        dragOver
          ? "border-accent/60 ring-1 ring-accent/30"
          : "hover:bg-surface-2/40"
      } ${completed ? "opacity-55" : ""} ${dragging ? "opacity-40" : ""} ${
        overdue ? "border-red-400/40" : "border-border"
      }`}
    >
      <div className="flex items-start gap-2">
        {onDragStart && (
          <span
            className="mt-0.5 -ml-1 text-text-muted/60 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity duration-100"
            aria-hidden="true"
          >
            <GripVertical size={13} />
          </span>
        )}
        <input
          type="checkbox"
          checked={completed}
          onChange={handleToggle}
          aria-label={`Toggle ${todo.title}`}
          className="mt-0.5 accent-accent flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          {inlineTitle ? (
            <input
              ref={titleRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={onTitleKey}
              aria-label="Edit task title"
              className="w-full text-sm font-medium bg-bg border border-accent rounded-md px-1.5 py-0.5 outline-none ring-2 ring-accent/20"
            />
          ) : (
            <button
              type="button"
              className="text-sm font-medium break-words cursor-text text-text bg-transparent p-0 m-0 border-0 text-left w-full transition-colors duration-150"
              onDoubleClick={startInlineEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  startInlineEdit();
                }
              }}
              title="Double-click to rename"
            >
              <span
                className={`${
                  completed ? "line-through text-text-muted" : "text-text"
                } transition-colors duration-150`}
              >
                {todo.title}
              </span>
            </button>
          )}

          {todo.description && (
            <div className="mt-0.5 text-text-muted">
              <div ref={descRef} className={expanded ? "" : "line-clamp-2"}>
                <TodoMarkdown content={todo.description} />
              </div>
              {(truncated || expanded) && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="mt-0.5 text-[11px] font-medium text-accent dark:text-blue-400 hover:text-accent-hover dark:hover:text-blue-300 inline-flex items-center gap-0.5"
                >
                  {expanded ? "Show less" : "Read more"}
                  {expanded && <ChevronDown size={11} className="rotate-180" />}
                </button>
              )}
            </div>
          )}

          {/* Skipped entirely when there is nothing to show, rather than
              leaving an empty row and its margin under the title. */}
          {hasMeta && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              {dueLabel !== null && (
                <TodoDateChip
                  icon="due"
                  label={dueLabel}
                  title={dueTitle}
                  overdue={overdue}
                />
              )}
              {remindLabel !== null && (
                <TodoDateChip
                  icon="remind"
                  label={remindLabel}
                  title={remindTitle}
                />
              )}
              <TodoPriorityBadge priority={todo.priority} />
              {/* Only the agent's mark is worth a chip — "created by you" is the
                default and was a person icon on every single row. */}
              {todo.created_by === "agent" && (
                <span
                  className="flex items-center text-text-muted/60"
                  title="Created by agent"
                >
                  <Bot size={11} />
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floated out of the meta row: sharing that line pushed the date and
          reminder chips onto a second line on a narrow panel. */}
      <div
        // The before:* gradient fades a long title out under the bar instead
        // of letting it collide with a hard edge.
        className={`absolute top-1 right-1 flex items-center gap-0.5 rounded-md border border-border/70 bg-surface px-0.5 py-0.5 shadow-sm transition-opacity duration-100 before:absolute before:right-full before:top-0 before:bottom-0 before:w-8 before:bg-gradient-to-l before:from-surface before:to-transparent before:content-[''] ${actionVisibility}`}
      >
        <button
          type="button"
          onClick={() =>
            void usePomodoroStore
              .getState()
              .start({ task: todo.title, todo_id: todo.id })
          }
          aria-label={`Start focus on ${todo.title}`}
          title="Start focus on this task"
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2"
        >
          <Timer size={13} />
        </button>
        <button
          type="button"
          onClick={openTodoChat}
          aria-label={`Chat about ${todo.title}`}
          title="Chat about this task (C)"
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2"
        >
          <MessageSquare size={13} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${todo.title}`}
          title="Edit task (E)"
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={() => deleteTodo(todo.id)}
          aria-label={`Delete ${todo.title}`}
          title="Delete (Del)"
          className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {editing && <TodoForm todo={todo} onClose={() => setEditing(false)} />}
    </div>
  );
}

const TodoItem = memo(TodoItemBase);
export default TodoItem;
