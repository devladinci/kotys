import { memo, useCallback, useEffect, useRef, useState } from "react";

interface IProps {
  label: string;
  value: number;
  min: number;
  max: number;
  presets: number[];
  unit?: string;
  onChange: (value: number) => void;
}

/**
 * One row of a shared grid: label, the common values as chips, the box for
 * anything else, then the unit. It renders `display: contents` so every row in
 * the group lands on the same four column tracks — the unit cell is emitted
 * even when empty, because a missing one shunted the Cycles box out of line
 * with the two above it.
 *
 * The box also has to be clearable. Clamping on every keystroke gives
 * `Number("") === 0`, which `Math.max(min, …)` rewrote to the minimum, so
 * deleting "1" to type "20" left you stuck on "1". The draft string is the
 * source of truth while the box has focus; the value is clamped on blur.
 */
function DurationFieldBase({
  label,
  value,
  min,
  max,
  presets,
  unit,
  onChange,
}: IProps) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  // Preset clicks and external edits refresh the box, but never mid-typing.
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = useCallback(() => {
    focused.current = false;
    const parsed = Number(draft);
    const next =
      draft.trim() === "" || !Number.isFinite(parsed)
        ? value
        : Math.min(max, Math.max(min, Math.round(parsed)));
    setDraft(String(next));
    if (next !== value) onChange(next);
  }, [draft, value, min, max, onChange]);

  return (
    <div className="contents">
      <span className="text-[11px] text-text-muted">{label}</span>
      <div className="flex items-center gap-0.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            aria-pressed={value === preset}
            className={`text-[11px] px-1.5 py-0.5 rounded tabular-nums transition-colors duration-100 ${
              value === preset
                ? "text-accent bg-accent/10"
                : "text-text-muted hover:text-text hover:bg-surface-2/70"
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        aria-label={unit ? `${label} (${unit})` : label}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = Number(e.target.value);
          // Publish only values already inside the range; anything else waits
          // for blur so half-typed numbers are never rewritten under you.
          if (
            e.target.value.trim() !== "" &&
            Number.isFinite(parsed) &&
            parsed >= min &&
            parsed <= max
          ) {
            onChange(Math.round(parsed));
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-full px-1 py-0.5 text-[11px] text-center tabular-nums rounded bg-bg border border-border text-text outline-none focus:border-accent"
      />
      <span className="text-[11px] text-text-muted">{unit ?? ""}</span>
    </div>
  );
}

const DurationField = memo(DurationFieldBase);
export default DurationField;
