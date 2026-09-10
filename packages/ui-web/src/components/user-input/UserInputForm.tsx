import { useState } from "react";
import type { InputField, InputRequest } from "@kotys/contracts";
import ChoiceField from "./ChoiceField";
import TextField from "./TextField";

interface IProps {
  request: InputRequest;
  onSubmit: (answers: Record<string, string>) => void;
  onCancel: () => void;
}

/**
 * The form body of an input request: title, description, fields, buttons.
 * Deliberately dumb and reusable — any caller can render it outside the
 * modal. Submit stays disabled until every required field has a value.
 */
export function UserInputForm({ request, onSubmit, onCancel }: IProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const { title, description, fields } = request;

  // A fresh request gets a fresh draft. Reset during render (not in an
  // effect) when the id changes.
  const [renderedId, setRenderedId] = useState(request.id);
  if (renderedId !== request.id) {
    setRenderedId(request.id);
    setDraft({});
    setFailed(null);
  }

  const missing = fields.some((f: InputField) => {
    const required = f.required !== false;
    return required && !(draft[f.id] ?? "").trim();
  });

  const submit = () => {
    if (missing) return;
    setFailed(null);
    try {
      onSubmit(draft);
    } catch (err: unknown) {
      setFailed(err instanceof Error ? err.message : String(err));
    }
  };

  const setAnswer = (id: string, value: string) =>
    setDraft((d) => ({ ...d, [id]: value }));

  // Enter submits from single-line inputs; multiline needs Cmd/Ctrl+Enter so
  // a plain Enter stays a newline. Attached to the fields themselves — the
  // form element carries no listeners of its own.
  const onFieldKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const inTextarea = e.target instanceof HTMLTextAreaElement;
    if (inTextarea && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="text-base font-semibold text-text mb-1">{title}</h2>
      {description && (
        <p className="text-xs text-text-muted mb-3">{description}</p>
      )}
      <div className="mb-4">
        {fields.map((field) => (
          <div key={field.id} className="mb-3">
            {field.label && (
              <label className="block text-xs font-medium text-text-muted mb-1">
                {field.label}
              </label>
            )}
            {field.kind === "choice" ? (
              <ChoiceField
                field={field}
                value={draft[field.id]}
                onChange={(v) => setAnswer(field.id, v)}
              />
            ) : (
              <TextField
                field={field}
                value={draft[field.id]}
                onChange={(v) => setAnswer(field.id, v)}
                onKeyDown={onFieldKeyDown}
              />
            )}
          </div>
        ))}
      </div>
      {failed && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-sm text-red-400 font-medium">
          Could not deliver your answer to the main process ({failed}). The tool
          call will time out as unanswered — reload the window and try again.
        </div>
      )}
      <div className="flex justify-end items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border text-text hover:bg-surface-2 transition text-sm font-medium"
        >
          {request.cancelLabel ?? "Cancel"}
        </button>
        <button
          type="submit"
          onClick={(e) => {
            e.preventDefault();
            submit();
          }}
          disabled={missing}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition text-sm font-medium disabled:opacity-40 disabled:hover:bg-accent disabled:cursor-not-allowed"
        >
          {request.submitLabel ?? "Submit"}
        </button>
      </div>
    </form>
  );
}
