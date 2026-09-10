import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import type { SkillListing } from "@kotys/contracts";

interface IProps {
  query: string;
  skills: SkillListing[];
  onPick: (skill: SkillListing) => void;
  onClose: () => void;
}

/** Autocomplete for `/skill-name` typed at the start of the composer. */
export default function SlashMenu({ query, skills, onPick, onClose }: IProps) {
  // No cap: the list scrolls (max-h below), and hiding skills behind an
  // arbitrary limit reads as "the menu is broken".
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) => s.name.includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [skills, query]);

  const [indexState, setIndex] = useState({ query: "", at: 0 });
  // Reset to the top whenever the filter text changes — during render, not in
  // an effect, so the first paint of a new query is already correct.
  const index = indexState.query === query ? indexState.at : 0;

  const stateRef = useRef({ filtered, index, onPick, onClose });
  useEffect(() => {
    stateRef.current = { filtered, index, onPick, onClose };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const {
        filtered: rows,
        index: at,
        onPick: pick,
        onClose: close,
      } = stateRef.current;
      if (rows.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex({ query, at: Math.min(at + 1, rows.length - 1) });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex({ query, at: Math.max(at - 1, 0) });
      } else if (e.key === "Enter" || e.key === "Tab") {
        // Capture phase: stops the event before the textarea's own Enter
        // handler can also fire, so the pick never double-sends.
        e.preventDefault();
        e.stopPropagation();
        pick(rows[at]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey);
  }, [query]);

  if (filtered.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-40"
      role="listbox"
      aria-label="Skill commands"
    >
      <ul className="max-h-64 overflow-y-auto scrollbar-thin">
        {filtered.map((skill, i) => (
          <li
            key={skill.name}
            role="option"
            aria-selected={i === index}
            onMouseEnter={() => setIndex({ query, at: i })}
            onMouseDown={(e) => {
              // mousedown, not click: the textarea blur must not race it.
              e.preventDefault();
              onPick(skill);
            }}
            className="flex items-start gap-2.5 px-3 py-2 cursor-pointer aria-selected:bg-surface-2 hover:bg-surface-2 transition"
          >
            <Zap size={13} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium font-mono truncate">
                /{skill.name}
                {skill.argumentHint && (
                  <span className="text-text-muted font-sans font-normal ml-1.5">
                    {skill.argumentHint}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-text-muted line-clamp-2">
                {skill.description}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
