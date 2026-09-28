import type { ChangeEvent } from "react";
import type { ModelListing } from "@kotys/contracts";
import { modelRefName, modelRefSetting } from "@kotys/core";
import { FIELD_CLASS } from "./styles";

interface IProps {
  label: string;
  models: ModelListing[] | null;
  loadError: string | null;
  selected: string | null;
  emptyText: string;
  onChange: (setting: string | null) => void;
}

export function ModelSelect({
  label,
  models,
  loadError,
  selected,
  emptyText,
  onChange,
}: IProps) {
  const selectedName = modelRefName(selected);
  const list = models ?? [];
  const isUnavailable =
    selectedName !== null && !list.some((m) => m.name === selectedName);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const name = event.target.value;
    if (!name) {
      onChange(null);
      return;
    }
    const listing = list.find((m) => m.name === name);
    onChange(modelRefSetting(listing?.provider ?? "omlx", name));
  };

  if (!models && !loadError) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (list.length === 0 && !selectedName) {
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
        value={selectedName ?? ""}
        onChange={handleChange}
        className={FIELD_CLASS}
      >
        <option value="">None</option>
        {isUnavailable && (
          <option value={selectedName}>{selectedName} (unavailable)</option>
        )}
        {list.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>
    </>
  );
}
