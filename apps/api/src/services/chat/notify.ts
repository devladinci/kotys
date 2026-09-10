// Faster replies are already on the user's screen; notification is noise.
const NOTIFY_AFTER_MS = 2000;

/** The server always emits; each client decides whether to show it. */
export function maybeNotify(
  startedAt: number,
  content: string,
  emit: (title: string, body: string) => void,
): void {
  if (Date.now() - startedAt <= NOTIFY_AFTER_MS) return;
  const preview =
    content.length > 120 ? content.slice(0, 120).trimEnd() + "…" : content;
  emit("Kotys", preview || "New response ready");
}
