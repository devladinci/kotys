import os from "node:os";
import { events } from "./events.js";

/**
 * Tool approval round-trip.
 *
 * Tools that touch the machine (bash, write_file, apply_patch) need consent
 * before running. The server emits `approval:request`; any connected client
 * answers via `resolveApproval`.
 *
 * Every client shares one bearer token, and the request is broadcast to all
 * of them with the same payload — any of them is equally able to judge it.
 * The old owner-check made a phone silently unable to answer a request for a
 * stream the desktop had started, with the modal clearing locally while the
 * tool waited out its timeout.
 *
 * The timeout is generous — 60s assumed a window on the same machine; a
 * phone in a pocket needs longer. Abort retracts the dialog and the timeout
 * resolves the tool as denied, so a long timeout is not a hung tool.
 */
const APPROVAL_TIMEOUT_MS = 10 * 60_000;

type Pending = {
  settle: (approved: boolean) => void;
};

const pending = new Map<number, Pending>();
let nextId = 1;

export function requestApproval(
  req: {
    tool: string;
    command?: string;
    cwd?: string;
    destructive?: boolean;
    preview?: string;
  },
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  const id = nextId++;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => settle(false),
      APPROVAL_TIMEOUT_MS,
    );

    const settle = (approved: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      pending.delete(id);
      signal?.removeEventListener("abort", onAbort);
      // Every settle path announces itself so clients can drop the dialog —
      // approval:cancel doubles as the "answered elsewhere" signal.
      events.emitEvent("approval:cancel", { id });
      resolve(approved);
    };

    const onAbort = () => settle(false);

    pending.set(id, { settle });
    signal?.addEventListener("abort", onAbort, { once: true });

    events.emitEvent("approval:request", {
      id,
      ...req,
      host: os.hostname(),
    });
  });
}

/** Returns false when there is no pending request under this id. */
export function resolveApproval(id: number, approved: boolean): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  entry.settle(approved);
  return true;
}
