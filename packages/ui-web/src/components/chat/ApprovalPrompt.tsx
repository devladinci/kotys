import { memo, useEffect, useState, useCallback, useRef } from "react";
import { useToolApproval } from "@kotys/core";
import type { ApprovalRequest } from "@kotys/contracts";

// Both file tools ask every time, git repo or not — the label must not imply
// the prompt only appears for writes outside one.
const TOOL_LABELS: Record<string, string> = {
  bash: "run a shell command",
  write_file: "create or overwrite a file",
  apply_patch: "patch a file",
  capture_screen: "take a screenshot",
  control_screen: "click or type on the screen",
};

function ApprovalPromptComponent() {
  const { pending, accept, reject } = useToolApproval();
  const [failed, setFailed] = useState<string | null>(null);
  const alwaysAllowedRef = useRef<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastSeenIdRef = useRef<number | null>(null);

  // Auto-allow tools the user has marked "always" for this session. We react
  // to a *new* pending id so we only respond once per request. The accept is
  // deferred to a microtask: it clears `pending`, and that state write must
  // not land synchronously inside the effect body.
  useEffect(() => {
    if (!pending) {
      lastSeenIdRef.current = null;
      return;
    }
    if (lastSeenIdRef.current === pending.id) return;
    lastSeenIdRef.current = pending.id;
    if (!alwaysAllowedRef.current.has(pending.tool)) return;
    void Promise.resolve().then(() => {
      try {
        accept();
      } catch (err: unknown) {
        setFailed(err instanceof Error ? err.message : String(err));
      }
    });
  }, [pending, accept]);

  const respond = useCallback(
    (approved: boolean) => {
      setFailed(null);
      if (approved) accept();
      else reject();
    },
    [accept, reject],
  );

  const allowAlways = useCallback(() => {
    if (!pending) return;
    alwaysAllowedRef.current.add(pending.tool);
    setFailed(null);
    accept();
  }, [pending, accept]);

  useEffect(() => {
    if (!pending) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return;
      if (e.key === "y" || e.key === "Y" || e.key === "Enter") {
        e.preventDefault();
        respond(true);
      } else if (e.key === "n" || e.key === "N" || e.key === "Escape") {
        e.preventDefault();
        respond(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, respond]);

  if (!pending) return null;
  const req: ApprovalRequest = pending;
  const actionLabel = TOOL_LABELS[req.tool] ?? "perform an action";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Tool approval"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-surface border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 p-5 outline-none"
      >
        <h2 className="text-base font-semibold text-text mb-1">
          Allow {req.tool}?
        </h2>
        <p className="text-xs text-text-muted mb-3">
          The model wants to {actionLabel}
          {req.cwd ? ` in ${req.cwd}` : ""}.
        </p>
        {req.destructive && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-sm text-red-400 font-medium">
            Warning: this command matches a destructive pattern (rm, dd,
            curl|sh, chmod -R, eval, etc.). Review it carefully before
            approving.
          </div>
        )}
        {req.preview ? (
          <pre className="bg-surface-2 border border-border rounded-lg p-3 text-sm text-text font-mono whitespace-pre-wrap break-all mb-4 max-h-60 overflow-y-auto">
            {req.preview}
          </pre>
        ) : (
          <pre className="bg-surface-2 border border-border rounded-lg p-3 text-sm text-text font-mono whitespace-pre-wrap break-all mb-4 max-h-40 overflow-y-auto">
            {req.command ?? "(no detail)"}
          </pre>
        )}
        {failed && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-sm text-red-400 font-medium">
            Could not deliver your answer to the main process ({failed}). The
            tool call will time out as a denial — reload the window and try
            again.
          </div>
        )}
        <div className="flex justify-end items-center gap-2">
          <span className="mr-auto text-xs text-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border">
              Y
            </kbd>{" "}
            allow{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border ml-1">
              N
            </kbd>{" "}
            deny
          </span>
          <button
            onClick={() => respond(false)}
            className="px-4 py-2 rounded-lg border border-border text-text hover:bg-surface-2 transition text-sm font-medium"
          >
            Deny
          </button>
          <button
            onClick={() => respond(true)}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-ink transition text-sm font-medium"
          >
            Allow
          </button>
          <button
            onClick={() => allowAlways()}
            className="px-4 py-2 rounded-lg bg-accent/80 hover:bg-accent text-accent-ink transition text-sm font-medium"
            title={`Always allow ${req.tool} for this session`}
          >
            Always allow
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(ApprovalPromptComponent);
