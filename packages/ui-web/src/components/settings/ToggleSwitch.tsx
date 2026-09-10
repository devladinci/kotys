export function ToggleSwitch({
  enabled,
  label,
  onChange,
  size = "md",
}: {
  enabled: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
  size?: "sm" | "md";
}) {
  const small = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={`relative shrink-0 rounded-full transition-colors ${
        small ? "h-4 w-7 mt-0.5" : "h-5 w-9 mt-0.5"
      } ${enabled ? "bg-accent" : "bg-surface-2 border border-border"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 rounded-full bg-white shadow transition-transform ${
          small ? "h-3 w-3" : "h-4 w-4"
        } ${enabled ? (small ? "translate-x-3" : "translate-x-4") : "translate-x-0"}`}
      />
    </button>
  );
}
