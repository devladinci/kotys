import { memo } from "react";
import type { ChoiceField as ChoiceFieldType } from "@kotys/contracts";

interface IProps {
  field: ChoiceFieldType;
  value: string | undefined;
  onChange: (value: string) => void;
}

/** Radio-style single select; the selected option highlights. */
function ChoiceFieldComponent({ field, value, onChange }: IProps) {
  return (
    <div role="radiogroup" aria-label={field.label ?? field.id}>
      {field.options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`w-full text-left px-3 py-2 mb-1.5 rounded-lg border transition text-sm font-medium ${
              selected
                ? "border-accent bg-accent/15 text-text"
                : "border-border bg-surface hover:bg-surface-2 text-text"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default memo(ChoiceFieldComponent);
