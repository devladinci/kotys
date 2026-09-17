import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useRpc } from "@kotys/core";
import type { SkillListing } from "@kotys/contracts";
import { SkillEditor, type SkillDraft } from "./SkillEditor";
import { SkillRow } from "./SkillRow";

interface IEditorState {
  key: number;
  currentName: string | null;
  initial: SkillDraft;
}

const EMPTY_DRAFT: SkillDraft = {
  name: "",
  description: "",
  argumentHint: "",
  disableModelInvocation: false,
  userInvocable: true,
  body: "# Instructions\n",
};

const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const draftFromListing = (listing: SkillListing): SkillDraft => ({
  name: listing.name,
  description: listing.description,
  argumentHint: listing.argumentHint ?? "",
  disableModelInvocation: !listing.modelInvocable,
  userInvocable: listing.userInvocable,
  body: "",
});

export default function SkillsSettings() {
  const rpc = useRpc();
  const [skills, setSkills] = useState<SkillListing[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<IEditorState | null>(null);
  // Every open remounts the editor, so no draft leaks between skills.
  const editorOpens = useRef(0);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const rpcSkills = rpc.skills;

  const refresh = useCallback(async () => {
    try {
      setSkills(await rpcSkills.list());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [rpcSkills]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- initial load of skills */
    void refresh();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh]);

  const handleToggle = useCallback(
    async (name: string, enabled: boolean) => {
      setSkills(
        (prev) =>
          prev?.map((s) => (s.name === name ? { ...s, enabled } : s)) ?? prev,
      );
      try {
        await rpcSkills.setEnabled({ name, enabled });
      } catch (err) {
        setError(errorText(err));
      }
    },
    [rpcSkills],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await rpcSkills.remove({ name });
        void refresh();
      } catch (err) {
        setError(errorText(err));
      } finally {
        setConfirmingDelete(null);
      }
    },
    [rpcSkills, refresh],
  );

  const openEditor = useCallback(
    async (listing: SkillListing | null) => {
      setConfirmingDelete(null);
      editorOpens.current += 1;
      const key = editorOpens.current;
      if (!listing) {
        setEditor({ key, currentName: null, initial: EMPTY_DRAFT });
        return;
      }
      try {
        const detail = await rpcSkills.get({ name: listing.name });
        setEditor({
          key,
          currentName: listing.name,
          initial: detail
            ? {
                name: detail.name,
                description: detail.description,
                argumentHint: detail.argumentHint ?? "",
                disableModelInvocation: detail.disableModelInvocation,
                userInvocable: detail.userInvocable,
                body: detail.body,
              }
            : draftFromListing(listing),
        });
      } catch (err) {
        // Broken skill: edit what we know so the user can fix the typo.
        setError(errorText(err));
        setEditor({
          key,
          currentName: listing.name,
          initial: draftFromListing(listing),
        });
      }
    },
    [rpcSkills],
  );

  const handleAdd = () => void openEditor(null);

  const handleEdit = (skill: SkillListing) => void openEditor(skill);

  const handleDeleteClick = (name: string) => void handleDelete(name);

  const handleToggleClick = (name: string, enabled: boolean) =>
    void handleToggle(name, enabled);

  const handleCloseEditor = () => setEditor(null);

  const handleSaved = () => void refresh();

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">Skills</h2>
          <button
            type="button"
            onClick={handleAdd}
            aria-label="Add skill"
            className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text transition"
          >
            <Plus size={14} />
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Reusable procedures stored in{" "}
          <code className="font-mono text-[11px]">~/.kotys/skills</code>. The
          model sees each skill&apos;s name and description and loads the full
          instructions when one matches the task; slash-invocable skills also
          appear as / commands in the composer.
        </p>
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading || skills === null ? (
        <div className="flex items-center gap-2 text-xs text-text-muted py-4">
          <Loader2 size={14} className="animate-spin" />
          <span>Loading skills…</span>
        </div>
      ) : skills.length === 0 && !editor ? (
        <p className="text-xs text-text-muted py-2">
          No skills yet. Create one, or drop a directory with a SKILL.md into{" "}
          <code className="font-mono text-[11px]">~/.kotys/skills</code>.
        </p>
      ) : (
        <ul className="space-y-2">
          {skills.map((skill) => (
            <SkillRow
              key={skill.name}
              skill={skill}
              isConfirmingDelete={confirmingDelete === skill.name}
              onEdit={handleEdit}
              onAskDelete={setConfirmingDelete}
              onDelete={handleDeleteClick}
              onToggle={handleToggleClick}
            />
          ))}
        </ul>
      )}

      {editor && (
        <div className="mt-3">
          <SkillEditor
            key={editor.key}
            currentName={editor.currentName}
            initial={editor.initial}
            onClose={handleCloseEditor}
            onSaved={handleSaved}
          />
        </div>
      )}
    </div>
  );
}
