import { memo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useAppStore, THINKING_EFFORTS } from "@kotys/core";
import type { ThinkEffort } from "@kotys/contracts";

const LABELS: Record<ThinkEffort, string> = {
  off: "off",
  low: "low",
  medium: "medium",
  high: "high",
  max: "max",
};

const DESCRIPTIONS: Record<ThinkEffort, string> = {
  off: "No reasoning",
  low: "Quick reasoning",
  medium: "Balanced reasoning",
  high: "Deep reasoning",
  max: "Maximum reasoning",
};

// The exact lucide Brain hemisphere paths, so the fill is clipped to the same
// shape the outline draws.
const BRAIN_HEMISPHERES = [
  "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z",
  "M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z",
];

// The brain stays an outline; a soft accent fill rises from the bottom inside
// it, so higher effort = deeper fill. Clip is the brain path itself — all in
// one SVG, no CSS masks.
const FILL: Record<ThinkEffort, number> = {
  off: 0,
  low: 0.3,
  medium: 0.5,
  high: 0.75,
  max: 1,
};

function BrainGauge({ effort, size }: { effort: ThinkEffort; size: number }) {
  const fill = FILL[effort];
  const hemis = BRAIN_HEMISPHERES;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <clipPath id="brain-gauge-clip">
          <path d={hemis[0]} />
          <path d={hemis[1]} />
        </clipPath>
      </defs>
      {fill > 0 && (
        <g clipPath="url(#brain-gauge-clip)">
          <rect
            className="brain-gauge-rect"
            x="0"
            width="24"
            y={24 - 24 * fill}
            height={24 * fill}
            fill="var(--accent)"
            fillOpacity={0.4}
          />
        </g>
      )}
      <g
        fill="none"
        stroke={fill > 0 ? "var(--accent)" : "var(--text-muted)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "stroke 500ms" }}
      >
        <path d={hemis[0]} />
        <path d={hemis[1]} />
      </g>
    </svg>
  );
}

function ThinkingSelectorBase() {
  const [open, setOpen] = useState(false);
  const { thinkingEffort, setThinkingEffort } = useAppStore();

  const handleSelect = (effort: ThinkEffort) => {
    setOpen(false);
    void setThinkingEffort(effort);
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        onClick={() => setOpen((open) => !open)}
        aria-expanded={open}
        aria-label="Thinking effort"
        title={`Thinking effort: ${LABELS[thinkingEffort]} — ${DESCRIPTIONS[thinkingEffort]}`}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-surface-2 text-[11px] transition"
      >
        <BrainGauge effort={thinkingEffort} size={11} />
        {LABELS[thinkingEffort]}
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
            aria-label="Thinking effort"
            className="absolute bottom-full right-0 mb-1.5 w-44 bg-surface border border-border rounded-xl shadow-xl z-40 p-1.5"
          >
            {THINKING_EFFORTS.map((effort) => {
              const selected = effort === thinkingEffort;
              return (
                <button
                  key={effort}
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelect(effort)}
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
                    <BrainGauge effort={effort} size={12} />
                    <span>
                      <span className="block">{LABELS[effort]}</span>
                      <span className="block text-[10px] font-normal text-text-muted">
                        {DESCRIPTIONS[effort]}
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

const ThinkingSelector = memo(ThinkingSelectorBase);
export default ThinkingSelector;
