import { memo, useEffect, useRef } from "react";
import { Zap } from "lucide-react";
import type { SkillListing } from "@kotys/contracts";
import { setSlashIndex } from "./slashExtension";

interface IProps {
  items: SkillListing[];
  index: number;
  onPick: (skill: SkillListing) => void;
}

/** Autocomplete popup for `/skill-name` typed at the start of the composer. */
function SlashMenuBase({ items, index, onPick }: IProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-40"
      role="listbox"
      aria-label="Skill commands"
    >
      <ul className="max-h-64 overflow-y-auto scrollbar-thin">
        {items.map((skill, i) => (
          <li
            key={skill.name}
            role="option"
            aria-selected={i === index}
            onMouseEnter={() => setSlashIndex(i)}
            onMouseDown={(e) => {
              // mousedown, not click: the editor blur must not race it.
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

const SlashMenu = memo(SlashMenuBase);
export default SlashMenu;