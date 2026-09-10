import { memo } from "react";
import type { TextField as TextFieldType } from "@kotys/contracts";

interface IProps {
  field: TextFieldType;
  value: string | undefined;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

/** Free-text answer; textarea when the field opts into multiline. */
function TextFieldComponent({ field, value, onChange, onKeyDown }: IProps) {
  const common = {
    value: value ?? "",
    placeholder: field.placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    onKeyDown,
    className:
      "w-full px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-sm outline-none focus:border-accent placeholder:text-text-muted",
  };
  return field.multiline ? (
    <textarea rows={4} {...common} />
  ) : (
    <input type="text" {...common} />
  );
}

export default memo(TextFieldComponent);
