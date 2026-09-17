import { useCallback, useState } from "react";
import type { ChangeEvent } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useRpc } from "@kotys/core";

export type SkillDraft = {
  name: string;
  description: string;
  argumentHint: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  body: string;
};

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BODY_MAX = 64 * 1024;

function validateDraft(draft: SkillDraft): string | null {
  if (!NAME_PATTERN.test(draft.name) || draft.name.length > 64)
    return "Name: 1–64 chars, a-z 0-9 and hyphens; no leading/trailing or doubled hyphen";
  if (!draft.description.trim()) return "Description is required";
  if (draft.description.length > 1024)
    return "Description must be 1024 characters or fewer";
  if (draft.body.length > BODY_MAX) return "Body exceeds 64 KB";
  return null;
}

interface IProps {
  /** null = creating. */
  currentName: string | null;
  initial: SkillDraft;
  onClose: () => void;
  onSaved: () => void;
}

export function SkillEditor({
  currentName,
  initial,
  onClose,
  onSaved,
}: IProps) {
  const rpc = useRpc();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validationError = validateDraft(draft);
  const rpcSkills = rpc.skills;

  const update = (patch: Partial<SkillDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) =>
    update({ name: e.target.value.toLowerCase() });

  const handleArgumentHintChange = (e: ChangeEvent<HTMLInputElement>) =>
    update({ argumentHint: e.target.value });

  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    update({ description: e.target.value });

  const handleUserInvocableChange = (e: ChangeEvent<HTMLInputElement>) =>
    update({ userInvocable: e.target.checked });

  const handleModelInvocableChange = (e: ChangeEvent<HTMLInputElement>) =>
    update({ disableModelInvocation: !e.target.checked });

  const handleBodyChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    update({ body: e.target.value });

  const save = useCallback(async () => {
    if (validationError || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description,
        ...(draft.argumentHint.trim()
          ? { argumentHint: draft.argumentHint.trim() }
          : {}),
        disableModelInvocation: draft.disableModelInvocation,
        userInvocable: draft.userInvocable,
        body: draft.body,
      };
      if (currentName) {
        await rpcSkills.update({ ...payload, currentName });
      } else {
        await rpcSkills.create(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    validationError,
    saving,
    draft,
    currentName,
    rpcSkills,
    onSaved,
    onClose,
  ]);

  const remove = useCallback(async () => {
    if (!currentName || saving) return;
    setSaving(true);
    setError(null);
    try {
      await rpcSkills.remove({ name: currentName });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [currentName, saving, rpcSkills, onSaved, onClose]);

  const handleRemoveClick = () => void remove();

  const handleSaveClick = () => void save();

  return (
    <div className="border border-border rounded-xl bg-bg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] text-text-muted mb-1">Name</span>
          <input
            type="text"
            value={draft.name}
            onChange={handleNameChange}
            placeholder="release-notes"
            aria-label="Skill name"
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent font-mono"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-text-muted mb-1">
            Argument hint (autocomplete)
          </span>
          <input
            type="text"
            value={draft.argumentHint}
            onChange={handleArgumentHintChange}
            placeholder="[tag range]"
            aria-label="Argument hint"
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>
      <label className="block">
        <span className="block text-[11px] text-text-muted mb-1">
          Description — what it does and when to use it (this is what the model
          sees)
        </span>
        <textarea
          value={draft.description}
          onChange={handleDescriptionChange}
          rows={2}
          aria-label="Skill description"
          className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent resize-y"
        />
        <span className="text-[10px] text-text-muted">
          {draft.description.length}/1024
        </span>
      </label>
      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.userInvocable}
            onChange={handleUserInvocableChange}
            className="accent-[var(--accent,theme(colors.blue.600))]"
          />
          <span className="text-xs">Slash command (/name)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!draft.disableModelInvocation}
            onChange={handleModelInvocableChange}
            className="accent-[var(--accent,theme(colors.blue.600))]"
          />
          <span className="text-xs">Model may auto-trigger</span>
        </label>
      </div>
      <label className="block">
        <span className="block text-[11px] text-text-muted mb-1">
          Instructions (Markdown) — $ARGUMENTS for the whole input, $1 $2…
          positionally
        </span>
        <textarea
          value={draft.body}
          onChange={handleBodyChange}
          rows={12}
          aria-label="Skill body"
          className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent font-mono resize-y min-h-40"
        />
      </label>
      {validationError && (
        <p className="text-xs text-amber-500">{validationError}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        {currentName && (
          <button
            type="button"
            onClick={handleRemoveClick}
            disabled={saving}
            aria-label="Delete skill"
            className="p-1.5 rounded text-text-muted hover:text-red-500 hover:bg-surface-2 transition disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 text-xs transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={Boolean(validationError) || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          Save
        </button>
      </div>
    </div>
  );
}
