import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { useRpc } from "@kotys/core";
import type { SkillListing } from "@kotys/contracts";
import { ToggleSwitch } from "./ToggleSwitch";
import SkillEditor, { type SkillDraft } from "./SkillEditor";

const SOURCE_STYLES: Record<SkillListing["source"], string> = {
  user: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  bundled: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};

const EMPTY_DRAFT: SkillDraft = {
  name: "",
  description: "",
  argumentHint: "",
  disableModelInvocation: false,
  userInvocable: true,
  body: "# Instructions\n",
};

export default function SkillsSettings() {
  const rpc = useRpc();
  const [skills, setSkills] = useState<SkillListing[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    currentName: string | null;
    initial: SkillDraft;
  } | null>(null);
  // Two-click delete, per row — same confirm pattern as MemorySettings.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const rpcSkills = rpc.skills;

  const refresh = useCallback(async () => {
    try {
      const list = await rpcSkills.list();
      setSkills(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [rpcSkills],
  );

  const handleRemove = useCallback(
    async (name: string) => {
      try {
        await rpcSkills.remove({ name });
        setConfirmingDelete(null);
        void refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setConfirmingDelete(null);
      }
    },
    [rpcSkills, refresh],
  );

  const openEditor = useCallback(
    async (listing: SkillListing | null) => {
      setConfirmingDelete(null);
      if (!listing) {
        setEditor({ currentName: null, initial: EMPTY_DRAFT });
        return;
      }
      const fallback: SkillDraft = {
        name: listing.name,
        description: listing.description,
        argumentHint: listing.argumentHint ?? "",
        disableModelInvocation: !listing.modelInvocable,
        userInvocable: listing.userInvocable,
        body: "",
      };
      try {
        const detail = await rpcSkills.get({ name: listing.name });
        setEditor({
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
            : fallback,
        });
      } catch (err) {
        // Broken skill: edit what we know so the user can fix the typo.
        setError(err instanceof Error ? err.message : String(err));
        setEditor({ currentName: listing.name, initial: fallback });
      }
    },
    [rpcSkills],
  );

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">Skills</h2>
          <button
            type="button"
            onClick={() => void openEditor(null)}
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
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="px-4 py-3 bg-surface border border-border rounded-xl"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Zap
                      size={13}
                      className="shrink-0 text-accent"
                      aria-hidden
                    />
                    <span className="text-sm truncate font-medium font-mono">
                      {skill.name}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${SOURCE_STYLES[skill.source] ?? ""}`}
                    >
                      {skill.source}
                    </span>
                    {skill.userInvocable && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-surface-2 border-border text-text-muted">
                        /slash
                      </span>
                    )}
                    {skill.modelInvocable && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-surface-2 border-border text-text-muted">
                        auto
                      </span>
                    )}
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
                  {confirmingDelete === skill.name ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleRemove(skill.name)}
                        className="px-2 py-1 rounded-lg text-[11px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel delete"
                        onClick={() => setConfirmingDelete(null)}
                        className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition"
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void openEditor(skill)}
                        aria-label={`Edit ${skill.name}`}
                        className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(skill.name)}
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
                    onChange={(next) => void handleToggle(skill.name, next)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <div className="mt-3">
          <SkillEditor
            currentName={editor.currentName}
            initial={editor.initial}
            onClose={() => setEditor(null)}
            onSaved={() => void refresh()}
          />
        </div>
      )}
    </div>
  );
}
