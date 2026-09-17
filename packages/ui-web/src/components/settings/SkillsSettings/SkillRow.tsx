import { Pencil, Trash2, X, Zap } from "lucide-react";
import type { SkillListing } from "@kotys/contracts";
import { ToggleSwitch } from "../ToggleSwitch";

const SOURCE_STYLES: Record<SkillListing["source"], string> = {
  user: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  bundled: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};

const BADGE_CLASS =
  "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-surface-2 border-border text-text-muted";

interface IProps {
  skill: SkillListing;
  isConfirmingDelete: boolean;
  onEdit: (skill: SkillListing) => void;
  onAskDelete: (name: string | null) => void;
  onDelete: (name: string) => void;
  onToggle: (name: string, enabled: boolean) => void;
}

export function SkillRow({
  skill,
  isConfirmingDelete,
  onEdit,
  onAskDelete,
  onDelete,
  onToggle,
}: IProps) {
  const handleEdit = () => onEdit(skill);

  const handleAskDelete = () => onAskDelete(skill.name);

  const handleCancelDelete = () => onAskDelete(null);

  const handleDelete = () => onDelete(skill.name);

  const handleToggle = (enabled: boolean) => onToggle(skill.name, enabled);

  return (
    <li className="px-4 py-3 bg-surface border border-border rounded-xl">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Zap size={13} className="shrink-0 text-accent" aria-hidden />
            <span className="text-sm truncate font-medium font-mono">
              {skill.name}
            </span>
            <span
              className={`shrink-0 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${SOURCE_STYLES[skill.source] ?? ""}`}
            >
              {skill.source}
            </span>
            {skill.userInvocable && <span className={BADGE_CLASS}>/slash</span>}
            {skill.modelInvocable && <span className={BADGE_CLASS}>auto</span>}
          </div>
          {skill.error ? (
            <div className="text-[11px] text-red-500 leading-snug mt-0.5">
              {skill.error}
            </div>
          ) : (
            <div className="text-[11px] text-text-muted leading-snug mt-0.5 line-clamp-2">
              {skill.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isConfirmingDelete ? (
            <>
              <button
                type="button"
                onClick={handleDelete}
                className="px-2 py-1 rounded-lg text-[11px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition"
              >
                Delete
              </button>
              <button
                type="button"
                aria-label="Cancel delete"
                onClick={handleCancelDelete}
                className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleEdit}
                aria-label={`Edit ${skill.name}`}
                className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={handleAskDelete}
                aria-label={`Delete ${skill.name}`}
                className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-surface-2 transition"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
          <ToggleSwitch
            size="sm"
            enabled={skill.enabled}
            label={`Toggle ${skill.name}`}
            onChange={handleToggle}
          />
        </div>
      </div>
    </li>
  );
}
