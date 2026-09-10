import { memo } from "react";
import { CircleHelp } from "lucide-react";
import type { InputWidget } from "@kotys/contracts";

/**
 * The answered form, frozen in the transcript: the question the model asked
 * and what was answered — or that nothing was. Stale like the chat text it
 * sits under; the live, editable twin is UserInputComposer.
 */
function InputCardBase({ widget }: { widget: InputWidget }) {
  const { title, description, fields, answers } = widget;
  return (
    <div className="my-2 rounded-lg border border-border bg-surface overflow-hidden px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <CircleHelp
          size={14}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-indigo-500"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium break-words text-text">
            {title}
          </div>
          {description && (
            <div className="text-xs text-text-muted mt-1 line-clamp-3 break-words">
              {description}
            </div>
          )}
          <dl className="mt-2 space-y-1">
            {fields.map((field) => {
              const value = answers?.[field.id];
              const shown = value
                ? field.kind === "choice"
                  ? (field.options.find((o) => o.value === value)?.label ??
                    value)
                  : value
                : null;
              return (
                <div key={field.id} className="text-xs leading-4 min-w-0">
                  <dt className="text-text-muted/70">
                    {field.label ?? field.id}
                  </dt>
                  <dd
                    className={`break-words ${
                      value ? "text-text" : "text-text-muted italic"
                    }`}
                  >
                    {shown ?? "No answer"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </div>
  );
}

const InputCard = memo(InputCardBase);
export default InputCard;
