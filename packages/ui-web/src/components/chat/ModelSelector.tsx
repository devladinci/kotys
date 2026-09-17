import { memo, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Cpu,
  Eye,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { useAppStore } from "@kotys/core";
import { useModels } from "@kotys/core";
import type { ModelListing } from "@kotys/contracts";
import { useOverflowFlip } from "./useOverflowFlip";

interface IProps {
  /** The chat's model; without it the picker shows the global default. */
  model?: ModelListing;
  onSelect?: (model: ModelListing) => void | Promise<void>;
  /** Compact pill for the composer footer; dropdown opens upward. */
  compact?: boolean;
}

// This renders inside the ChatView header, which is a draggable window region.
// Anything interactive in there has to opt out or the OS eats the click before
// it reaches React.
const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

function ModelSelectorBase({ model, onSelect, compact }: IProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const models = useModels();
  const { defaultModel, setDefaultModel } = useAppStore();
  const shown = model ?? defaultModel;
  const [popupRef, popupSide] = useOverflowFlip<HTMLDivElement>(open);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, query]);

  const handleOpen = () => {
    setQuery("");
    setOpen(true);
    // Focus after mount; the input is conditionally rendered.
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const handleSelect = async (m: ModelListing) => {
    setOpen(false);
    await setDefaultModel(m);
    await onSelect?.(m);
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        onClick={handleOpen}
        aria-expanded={open}
        aria-label="Select model"
        title={`Model — ${shown.name}`}
        style={NO_DRAG}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-surface-2 text-[11px] transition"
      >
        <Cpu size={11} className="text-text-muted" />
        <span className="text-text-muted">
          {shown.provider === "omlx"
            ? "omlx"
            : shown.source === "local"
              ? "local"
              : "cloud"}
        </span>
        {shown.name}
        <ChevronDown size={10} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            style={NO_DRAG}
            aria-hidden="true"
          />
          <div
            ref={popupRef}
            role="listbox"
            aria-label="Available models"
            style={NO_DRAG}
            className={`absolute w-80 max-h-96 overflow-y-auto scrollbar-thin bg-surface border border-border rounded-xl shadow-xl z-40 p-1.5 ${
              compact ? "bottom-full mb-1.5" : "top-full mt-1"
            } ${
              popupSide === "center"
                ? "left-1/2 -translate-x-1/2"
                : popupSide === "right"
                  ? "right-0"
                  : "left-0"
            }`}
          >
            <div className="flex items-center gap-1.5 px-2 py-1 mb-1 rounded-lg bg-surface-2 border border-border focus-within:border-accent">
              <Search size={12} className="text-text-muted shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
                placeholder="Search models..."
                aria-label="Search models"
                className="flex-1 min-w-0 bg-transparent text-xs text-text placeholder-text-muted outline-none"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="text-text-muted hover:text-text transition"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {models.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-muted">
                No models available
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-muted">
                No models match "{query}"
              </div>
            ) : null}
            {filtered.map((m) => {
              const provider = m.provider ?? "ollama";
              const selected =
                m.name === defaultModel.name &&
                provider === (defaultModel.provider ?? "ollama");
              return (
                <button
                  key={`${provider}:${m.name}:${m.source}`}
                  role="option"
                  aria-selected={selected}
                  onClick={() => void handleSelect(m)}
                  className={`w-full grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition ${
                    selected
                      ? "bg-surface-2 font-semibold"
                      : "hover:bg-surface-2"
                  }`}
                >
                  <Check
                    size={13}
                    className={selected ? "text-accent" : "opacity-0"}
                  />
                  <span className="truncate text-sm">{m.name}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {m.capabilities.includes("vision") && (
                      <span title="Vision (images)" className="text-text-muted">
                        <Eye size={12} />
                      </span>
                    )}
                    {m.capabilities.includes("tools") && (
                      <span title="Tool calling" className="text-text-muted">
                        <Wrench size={12} />
                      </span>
                    )}
                    {m.capabilities.includes("thinking") && (
                      <span title="Thinking" className="text-text-muted">
                        <Brain size={12} />
                      </span>
                    )}
                    <span
                      className={
                        "text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded w-11 text-center " +
                        (m.source === "local"
                          ? "bg-accent/15 text-accent"
                          : "bg-surface-2 text-text-muted")
                      }
                    >
                      {provider === "omlx"
                        ? "omlx"
                        : m.source === "local"
                          ? "local"
                          : "cloud"}
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

const ModelSelector = memo(ModelSelectorBase);
export default ModelSelector;
