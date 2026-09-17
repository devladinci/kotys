import type { ChangeEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { envRow } from "./mcpConfig";
import type { McpDraft, McpEnvRow, McpServerType } from "./mcpConfig";

interface IProps {
  draft: McpDraft;
  isEditing: boolean;
  isSaving: boolean;
  onChange: (draft: McpDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}

const INPUT_CLASS =
  "w-full bg-surface border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent";
const ENV_INPUT_CLASS =
  "flex-1 bg-surface border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent font-mono";

export function McpServerForm({
  draft,
  isEditing,
  isSaving,
  onChange,
  onCancel,
  onSave,
}: IProps) {
  const update = (patch: Partial<McpDraft>) => onChange({ ...draft, ...patch });

  const updateEnv = (id: number, patch: Partial<McpEnvRow>) =>
    update({
      env: draft.env.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) =>
    update({ name: e.target.value });

  const handleTypeChange = (e: ChangeEvent<HTMLSelectElement>) =>
    update({ type: e.target.value as McpServerType });

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) =>
    update({ url: e.target.value });

  const handleClientIdChange = (e: ChangeEvent<HTMLInputElement>) =>
    update({ clientId: e.target.value });

  const handleCommandChange = (e: ChangeEvent<HTMLInputElement>) =>
    update({ command: e.target.value });

  const handleArgsChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    update({ args: e.target.value });

  const handleAddEnvRow = () => update({ env: [...draft.env, envRow()] });

  return (
    <div className="mt-3 border border-border rounded-lg p-3 bg-bg space-y-2">
      <div>
        <span className="block text-[11px] text-text-muted mb-1">Name</span>
        <input
          type="text"
          value={draft.name}
          onChange={handleNameChange}
          disabled={isEditing}
          placeholder="slack"
          aria-label="Server name"
          className={`${INPUT_CLASS} disabled:opacity-60`}
        />
      </div>
      {!isEditing && (
        <div>
          <span className="block text-[11px] text-text-muted mb-1">Type</span>
          <select
            value={draft.type}
            onChange={handleTypeChange}
            aria-label="Server type"
            className={INPUT_CLASS}
          >
            <option value="stdio">Stdio (local subprocess)</option>
            <option value="http">HTTP (remote + OAuth)</option>
          </select>
        </div>
      )}
      {draft.type === "http" ? (
        <>
          <div>
            <span className="block text-[11px] text-text-muted mb-1">URL</span>
            <input
              type="text"
              value={draft.url}
              onChange={handleUrlChange}
              placeholder="https://mcp.slack.com/mcp"
              aria-label="Server URL"
              className={`${INPUT_CLASS} font-mono`}
            />
          </div>
          <div>
            <span className="block text-[11px] text-text-muted mb-1">
              Client ID (optional — for pre-registered OAuth)
            </span>
            <input
              type="text"
              value={draft.clientId}
              onChange={handleClientIdChange}
              placeholder="1601185624273.8899143856786"
              aria-label="OAuth client ID"
              className={`${INPUT_CLASS} font-mono`}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <span className="block text-[11px] text-text-muted mb-1">
              Command
            </span>
            <input
              type="text"
              value={draft.command}
              onChange={handleCommandChange}
              placeholder="npx"
              aria-label="Command"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <span className="block text-[11px] text-text-muted mb-1">
              Args (one per line)
            </span>
            <textarea
              value={draft.args}
              onChange={handleArgsChange}
              placeholder={"-y\nkorotovsky/slack-mcp-server"}
              aria-label="Arguments"
              rows={3}
              className={`${INPUT_CLASS} font-mono`}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-[11px] text-text-muted">
                Environment variables
              </span>
              <button
                type="button"
                onClick={handleAddEnvRow}
                className="text-text-muted hover:text-text transition"
                aria-label="Add environment variable"
              >
                <Plus size={12} />
              </button>
            </div>
            <div className="space-y-1.5">
              {draft.env.length === 0 && (
                <p className="text-[11px] text-text-muted">No env vars.</p>
              )}
              {draft.env.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => updateEnv(row.id, { key: e.target.value })}
                    placeholder="SLACK_BOT_TOKEN"
                    aria-label="Env var key"
                    className={ENV_INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) =>
                      updateEnv(row.id, { value: e.target.value })
                    }
                    placeholder="xoxb-..."
                    aria-label="Env var value"
                    className={ENV_INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update({ env: draft.env.filter((r) => r.id !== row.id) })
                    }
                    aria-label="Remove env var"
                    className="p-1 rounded text-text-muted hover:text-red-500 hover:bg-surface-2 transition"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 text-xs transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
