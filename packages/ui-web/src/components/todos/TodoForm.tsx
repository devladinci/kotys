import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Eye, Pencil, X } from "lucide-react";
import type {
  CreateTodoInput,
  TodoRecord,
  TodoPriority,
} from "@kotys/contracts";
import {
  asEpochSeconds,
  epochToDate,
  toMillis,
  type EpochSeconds,
} from "@kotys/contracts";
import { useTodoStore } from "@kotys/core";
import {
  pastDateError,
  validateNewTodoDates,
  validateTodoDateChanges,
} from "@kotys/core";
import TodoMarkdown from "./TodoMarkdown";

interface IProps {
  todo?: TodoRecord;
  onClose: () => void;
}

const PRIORITIES: TodoPriority[] = ["low", "medium", "high"];

// `datetime-local` speaks local wall-clock time, so the value has to be built
// from local components. Formatting via toISOString() would hand the input a
// UTC reading of the same instant, and since the browser parses what comes
// back as local time, every edit round-trip would shift the task by the UTC
// offset — compounding on each save.
const pad = (n: number): string => String(n).padStart(2, "0");

const toLocalInput = (ts: EpochSeconds | null): string => {
  if (!ts) return "";
  const d = epochToDate(toMillis(ts));
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

const fromLocalInput = (val: string): EpochSeconds | null => {
  if (!val) return null;
  const ts = new Date(val).getTime();
  return Number.isNaN(ts) ? null : asEpochSeconds(Math.floor(ts / 1000));
};

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Both the sidebar's "new task" panel and a row's "edit" panel can be mounted
// at once. Only the one on top should answer Escape.
const modalStack: symbol[] = [];

function TodoFormBase({ todo, onClose }: IProps) {
  const createTodo = useTodoStore((s) => s.createTodo);
  const updateTodo = useTodoStore((s) => s.updateTodo);

  const [title, setTitle] = useState(todo?.title ?? "");
  const [description, setDescription] = useState(todo?.description ?? "");
  const [priority, setPriority] = useState<TodoPriority>(
    todo?.priority ?? "medium",
  );
  const [dueAt, setDueAt] = useState<EpochSeconds | null>(todo?.due_at ?? null);
  const [notifyAt, setNotifyAt] = useState<EpochSeconds | null>(
    todo?.notify_at ?? null,
  );
  // Evaluated when a value is chosen rather than during render, so the check
  // stays honest without reading the clock on every re-render. Only dates the
  // user actually changes are flagged — an existing overdue task has to stay
  // editable.
  const [dateError, setDateError] = useState<{
    due: string | null;
    notify: string | null;
  }>({ due: null, notify: null });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<symbol>(Symbol("todo-form"));
  // A press that starts inside the panel and ends outside it (selecting text
  // and overshooting) still reports the backdrop as the click target. Only a
  // press that both starts and ends on the backdrop counts as "click away".
  const pressOnBackdrop = useRef(false);

  const dirty =
    title !== (todo?.title ?? "") ||
    description !== (todo?.description ?? "") ||
    priority !== (todo?.priority ?? "medium") ||
    dueAt !== (todo?.due_at ?? null) ||
    notifyAt !== (todo?.notify_at ?? null);

  const requestClose = () => {
    if (dirty && !saving) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  // Escape must see the current dirty state, not the one captured when the
  // listener was attached.
  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  useEffect(() => {
    const token = tokenRef.current;
    modalStack.push(token);
    return () => {
      const i = modalStack.indexOf(token);
      if (i !== -1) modalStack.splice(i, 1);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== tokenRef.current) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        requestCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevActive = document.activeElement as HTMLElement | null;
    // Straight to the title: the first focusable in DOM order is the ✕ button,
    // which is not what anyone opening this panel wants to type into.
    titleRef.current?.focus();
    titleRef.current?.select();
    return () => {
      document.removeEventListener("keydown", onKey);
      prevActive?.focus?.();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    // Re-checked at submit, not just on pick: the panel can sit open long
    // enough for a once-valid time to slip into the past.
    const now = asEpochSeconds(Date.now() / 1000);
    const problem = todo
      ? validateTodoDateChanges(
          { due_at: dueAt, notify_at: notifyAt },
          todo,
          now,
        )
      : validateNewTodoDates({ due_at: dueAt, notify_at: notifyAt }, now);
    if (problem !== null) {
      // Reported through the per-field messages only. Also putting it in the
      // general `error` slot left a stale copy on screen after the user fixed
      // the date, since that slot is only cleared by a save attempt.
      setDateError({
        due:
          dueAt !== todo?.due_at ? pastDateError("due_at", dueAt, now) : null,
        notify:
          notifyAt !== todo?.notify_at
            ? pastDateError("notify_at", notifyAt, now)
            : null,
      });
      return;
    }
    const input: CreateTodoInput = {
      title: trimmed,
      description: description.trim() || null,
      priority,
      due_at: dueAt,
      notify_at: notifyAt,
    };
    setSaving(true);
    setError(null);
    try {
      // Awaited before closing: closing first meant a failed write took the
      // user's text with it.
      if (todo) {
        await updateTodo(todo.id, input);
      } else {
        await createTodo(input);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const pickDueAt = (ts: EpochSeconds | null) => {
    setDueAt(ts);
    setDateError((e) => ({
      ...e,
      due: ts === todo?.due_at ? null : pastDateError("due_at", ts),
    }));
  };

  const pickNotifyAt = (ts: EpochSeconds | null) => {
    setNotifyAt(ts);
    setDateError((e) => ({
      ...e,
      notify: ts === todo?.notify_at ? null : pastDateError("notify_at", ts),
    }));
  };

  return createPortal(
    /* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- modal backdrop dismiss */
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] todo-modal-enter"
      role="dialog"
      aria-modal="true"
      aria-label={todo ? "Edit task" : "New task"}
      onMouseDown={(e) => {
        pressOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressOnBackdrop.current) {
          requestClose();
        }
        pressOnBackdrop.current = false;
      }}
    >
      <form
        ref={panelRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
        className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/40 todo-panel-enter"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {todo ? "Edit Task" : "New Task"}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-all duration-150 hover:scale-105 active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="todo-title"
              className="text-xs text-text-muted mb-1 block"
            >
              Title
            </label>
            <input
              id="todo-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="todo-description"
                className="text-xs text-text-muted"
              >
                Description
              </label>
              {description.trim() && (
                <div className="flex items-center gap-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreview(false)}
                    aria-pressed={!preview}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                      !preview
                        ? "text-accent bg-surface-2"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    <Pencil size={11} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(true)}
                    aria-pressed={preview}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                      preview
                        ? "text-accent bg-surface-2"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    <Eye size={11} /> Preview
                  </button>
                </div>
              )}
            </div>
            {preview ? (
              <div className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm min-h-[80px]">
                {description.trim() ? (
                  <TodoMarkdown content={description} />
                ) : (
                  <span className="text-text-muted">Nothing to preview</span>
                )}
              </div>
            ) : (
              <textarea
                id="todo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — supports markdown (bold, lists, links, code)"
                rows={3}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
              />
            )}
          </div>

          <div>
            <label
              htmlFor="todo-priority"
              className="text-xs text-text-muted mb-1 block"
            >
              Priority
            </label>
            <select
              id="todo-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TodoPriority)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="todo-due"
                className="text-xs text-text-muted mb-1 block"
              >
                Due date
              </label>
              <input
                id="todo-due"
                type="datetime-local"
                value={toLocalInput(dueAt)}
                onChange={(e) => pickDueAt(fromLocalInput(e.target.value))}
                aria-invalid={dateError.due !== null}
                aria-describedby={
                  dateError.due !== null ? "todo-due-error" : undefined
                }
                className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent ${
                  dateError.due !== null ? "border-red-400" : "border-border"
                }`}
              />
            </div>
            <div>
              <label
                htmlFor="todo-notify"
                className="text-xs text-text-muted mb-1 block"
              >
                Remind me
              </label>
              <input
                id="todo-notify"
                type="datetime-local"
                value={toLocalInput(notifyAt)}
                onChange={(e) => pickNotifyAt(fromLocalInput(e.target.value))}
                aria-invalid={dateError.notify !== null}
                aria-describedby={
                  dateError.notify !== null ? "todo-notify-error" : undefined
                }
                className={`w-full bg-bg border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent ${
                  dateError.notify !== null ? "border-red-400" : "border-border"
                }`}
              />
            </div>
          </div>

          {dateError.due !== null && (
            <p
              id="todo-due-error"
              role="alert"
              className="flex items-start gap-1.5 text-[11px] text-red-400"
            >
              <AlertTriangle size={12} className="mt-px flex-shrink-0" />
              {dateError.due}
            </p>
          )}

          {dateError.notify !== null && (
            <p
              id="todo-notify-error"
              role="alert"
              className="flex items-start gap-1.5 text-[11px] text-red-400"
            >
              <AlertTriangle size={12} className="mt-px flex-shrink-0" />
              {dateError.notify}
            </p>
          )}

          {error !== null && (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-[11px] text-red-400"
            >
              <AlertTriangle size={12} className="mt-px flex-shrink-0" />
              Could not save: {error}
            </p>
          )}
        </div>

        {confirmDiscard ? (
          <div className="flex items-center gap-2 justify-end mt-5">
            <span className="text-xs text-text-muted mr-auto">
              Discard your changes?
            </span>
            <button
              type="button"
              onClick={() => setConfirmDiscard(false)}
              className="px-3 py-2 rounded-lg text-sm border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-all duration-150 active:scale-95"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-sm bg-red-500/90 hover:bg-red-500 text-white transition-all duration-150 active:scale-95"
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end mt-5">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 rounded-lg text-sm border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-all duration-150 active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all duration-150 hover:shadow-md hover:shadow-accent/30 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : todo ? "Save" : "Create"}
            </button>
          </div>
        )}
      </form>
    </div>,
    document.body,
    /* eslint-enable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
  );
}

const TodoForm = memo(TodoFormBase);
export default TodoForm;
