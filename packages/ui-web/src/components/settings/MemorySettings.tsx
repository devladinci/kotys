import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useRpc } from "@kotys/core";
import type { MemoryRecord, MemoryType } from "@kotys/contracts";

const TYPE_STYLES: Record<MemoryType, string> = {
  user: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  preference: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  project: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  fact: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const TYPES: MemoryType[] = ["user", "preference", "project", "fact"];

const TYPE_HINTS: Record<MemoryType, string> = {
  user: "always in context",
  preference: "always in context",
  project: "when topics match",
  fact: "when topics match",
};

const formatDate = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export default function MemorySettings() {
  const rpc = useRpc();
  const [memories, setMemories] = useState<MemoryRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftTopics, setDraftTopics] = useState("");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- initial load of memories */
    setLoading(true);
    void (async () => {
      try {
        const list = await rpc.memories.list();
        if (!cancelled) setMemories(list);
      } catch {
        if (!cancelled) setMemories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  const startEdit = useCallback((memory: MemoryRecord) => {
    setConfirmingId(null);
    setEditingId(memory.id);
    setDraftContent(memory.content);
    setDraftTopics(memory.topics.join(", "));
  }, []);

  const saveEdit = useCallback(
    async (id: number) => {
      const content = draftContent.trim();
      if (!content) return;
      const topics = draftTopics
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      setEditingId(null);
      const updated = await rpc.memories
        .update({ id, content, topics })
        .catch(() => null);
      if (!updated) return;
      setMemories((prev) =>
        prev ? prev.map((m) => (m.id === id ? updated : m)) : prev,
      );
    },
    [draftContent, draftTopics, rpc],
  );

  const remove = useCallback(
    async (id: number) => {
      setConfirmingId(null);
      const deleted = await rpc.memories.remove({ id }).catch(() => null);
      if (!deleted) return;
      setMemories((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
    },
    [rpc],
  );

  const visibleMemories = useMemo(() => {
    if (!memories) return [];
    const needle = filter.trim().toLowerCase();
    return memories.filter((m) => {
      if (typeFilter && m.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        m.content.toLowerCase().includes(needle) ||
        m.key.toLowerCase().includes(needle) ||
        m.topics.some((t) => t.includes(needle))
      );
    });
  }, [memories, filter, typeFilter]);

  const total = memories?.length ?? 0;

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-5 mb-4">
        <h2 className="text-base font-semibold mb-1">Memory</h2>
        <p className="text-xs text-text-muted">
          What the model has saved about you across chats. User and preference
          memories go into every conversation; project and fact memories surface
          when a chat&apos;s topics match theirs.{" "}
          {memories && <span className="text-text">{total} saved</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter memories…"
          aria-label="Filter memories"
          className="flex-1 min-w-0 bg-bg border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          type="button"
          onClick={() => setTypeFilter(null)}
          aria-pressed={typeFilter === null}
          className={`text-[11px] px-2 py-1 rounded-lg border transition ${
            typeFilter === null
              ? "border-accent text-accent bg-surface-2"
              : "border-border text-text-muted hover:text-text hover:bg-surface-2"
          }`}
        >
          All
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            aria-pressed={typeFilter === t}
            className={`text-[11px] px-2 py-1 rounded-lg border transition ${
              typeFilter === t
                ? "border-accent text-accent bg-surface-2"
                : "border-border text-text-muted hover:text-text hover:bg-surface-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading || memories === null ? (
        <div className="flex items-center gap-2 text-xs text-text-muted py-4">
          <Loader2 size={14} className="animate-spin" />
          <span>Loading memories…</span>
        </div>
      ) : visibleMemories.length === 0 ? (
        <div className="text-xs text-text-muted py-6 text-center leading-relaxed">
          {total === 0
            ? "Nothing saved yet. The model writes here on its own when you tell it something worth keeping beyond one chat."
            : "No memories match this filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleMemories.map((m) => {
            const editing = editingId === m.id;
            return (
              <li
                key={m.id}
                className="list-none px-4 py-3 bg-surface border border-border rounded-xl"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {editing ? (
                      <>
                        <textarea
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                          rows={3}
                          aria-label="Memory content"
                          className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-accent resize-y"
                        />
                        <input
                          type="text"
                          value={draftTopics}
                          onChange={(e) => setDraftTopics(e.target.value)}
                          placeholder="topics, comma separated"
                          aria-label="Memory topics"
                          className="mt-1.5 w-full bg-bg border border-border rounded-lg px-2 py-1 text-[11px] outline-none focus:border-accent"
                        />
                      </>
                    ) : (
                      <p className="text-sm leading-snug break-words">
                        {m.content}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span
                        title={TYPE_HINTS[m.type]}
                        className={`text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${TYPE_STYLES[m.type]}`}
                      >
                        {m.type}
                      </span>
                      {m.topics.map((topic) => (
                        <span
                          key={topic}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-muted"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>

                    <div className="text-[11px] text-text-muted mt-1.5 truncate">
                      <span className="font-mono">{m.key}</span>
                      {" · "}
                      {formatDate(m.updated_at)}
                      {m.source_chat_title && (
                        <> {`· from “${m.source_chat_title}”`}</>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          aria-label="Save memory"
                          onClick={() => void saveEdit(m.id)}
                          className="p-1.5 rounded-lg text-accent hover:bg-surface-2 transition"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel editing"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : confirmingId === m.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void remove(m.id)}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel delete"
                          onClick={() => setConfirmingId(null)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Edit memory ${m.key}`}
                          onClick={() => startEdit(m)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete memory ${m.key}`}
                          onClick={() => setConfirmingId(m.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-surface-2 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </div>
      )}
    </div>
  );
}
