import { memo, useState } from "react";
import {
  Check,
  ChevronDown,
  Plane,
  PlaneTakeoff,
  ShieldQuestion,
} from "lucide-react";
import { useAppStore } from "@kotys/core";
import { PERMISSION_MODES } from "@kotys/core";
import type { PermissionMode } from "@kotys/contracts";

const LABELS: Record<PermissionMode, string> = {
  ask: "ask",
  copilot: "copilot",
  autopilot: "autopilot",
};

const DESCRIPTIONS: Record<PermissionMode, string> = {
  ask: "Confirm every tool use",
  copilot: "Reads freely, asks before writes",
  autopilot: "Reads and writes without asking",
};

const ICONS: Record<PermissionMode, typeof Plane> = {
  ask: ShieldQuestion,
  copilot: Plane,
  autopilot: PlaneTakeoff,
};

const TINTS: Record<PermissionMode, string> = {
  ask: "var(--text-muted)",
  copilot: "var(--accent)",
  autopilot: "#10b981",
};

function ModeSelectorBase() {
  const [open, setOpen] = useState(false);
  const { permissionMode, setPermissionMode } = useAppStore();

  const handleSelect = (mode: PermissionMode) => {
    setOpen(false);
    void setPermissionMode(mode);
  };

  const Icon = ICONS[permissionMode];

  return (
    <span className="relative inline-flex shrink-0">
      <button
        onClick={() => setOpen((open) => !open)}
        aria-expanded={open}
        aria-label="Permission mode"
        title={`Permission mode: ${LABELS[permissionMode]} — ${DESCRIPTIONS[permissionMode]}`}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-surface-2 text-[11px] transition"
      >
        <Icon
          size={12}
          className="transition-colors duration-300"
          style={{ color: TINTS[permissionMode] }}
        />
        {LABELS[permissionMode]}
        <ChevronDown
          size={10}
          className={`text-text-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="listbox"
            aria-label="Permission mode"
            className="absolute bottom-full right-0 mb-1.5 w-52 bg-surface border border-border rounded-xl shadow-xl z-40 p-1.5"
          >
            {PERMISSION_MODES.map((mode) => {
              const selected = mode === permissionMode;
              const OptionIcon = ICONS[mode];
              return (
                <button
                  key={mode}
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelect(mode)}
                  className={`w-full grid grid-cols-[14px_minmax(0,1fr)] items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition ${
                    selected
                      ? "bg-surface-2 font-semibold"
                      : "hover:bg-surface-2"
                  }`}
                >
                  <Check
                    size={13}
                    className={selected ? "text-accent" : "opacity-0"}
                  />
                  <span className="truncate text-sm flex items-center gap-1.5">
                    <OptionIcon
                      size={12}
                      style={{ color: TINTS[mode] }}
                      className="shrink-0"
                    />
                    <span>
                      <span className="block">{LABELS[mode]}</span>
                      <span className="block text-[10px] font-normal text-text-muted">
                        {DESCRIPTIONS[mode]}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}

const ModeSelector = memo(ModeSelectorBase);
export default ModeSelector;
