import type { ChangeEvent } from "react";
import type { ModelListing } from "@kotys/contracts";
import type { IModelOption } from "@kotys/core";
import { FIELD_CLASS } from "./styles";

interface IProps {
  label: string;
  models: ModelListing[] | null;
  loadError: string | null;
  selected: IModelOption | null;
  emptyText: string;
  optionOf: (model: ModelListing) => IModelOption;
  onChange: (key: string | null) => void;
}

export function ModelSelect({
  label,
  models,
  loadError,
  selected,
  emptyText,
  optionOf,
  onChange,
}: IProps) {
  const options = (models ?? []).map(optionOf);
  const isUnavailable =
    selected !== null && !options.some((o) => o.key === selected.key);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value || null);
  };

  if (!models && !loadError) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (options.length === 0 && !selected) {
    return (
      <p
        className={
          loadError ? "text-sm text-red-400" : "text-sm text-text-muted"
        }
      >
        {loadError ?? emptyText}
      </p>
    );
  }

  return (
    <>
      {loadError && <p className="text-sm text-red-400 mb-2">{loadError}</p>}
      <select
        aria-label={label}
        value={selected?.key ?? ""}
        onChange={handleChange}
        className={FIELD_CLASS}
      >
        <option value="">None</option>
        {isUnavailable && (
          <option value={selected.key}>{selected.label} (unavailable)</option>
        )}
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}
