import os from "node:os";
import { events } from "./events.js";
import type { InputField, InputRequest } from "@kotys/contracts";

/**
 * User-input round-trip — the structured sibling of tool approval.
 *
 * The model asks the user to fill a small form (choices and/or free text);
 * the server emits `input:request` and any connected client answers via
 * `resolveUserInput`. Every settle path emits `input:cancel` so all dialogs
 * drop.
 *
 * The timeout is long on purpose — tests invite thinking. Abort retracts the
 * form and the timeout resolves the tool as unanswered, so a long timeout is
 * not a hung tool. One pending request at a time: forms are a conversation
 * turn, not a background queue.
 */
const INPUT_TIMEOUT_MS = 15 * 60_000;

type Pending = {
  settle: (answers: Record<string, string> | null) => void;
};

const pending = new Map<number, Pending>();
let nextId = 1;

export function requestUserInput(
  req: {
    title: string;
    description?: string;
    fields: InputField[];
    submitLabel?: string;
    cancelLabel?: string;
  },
  signal?: AbortSignal,
): Promise<Record<string, string> | null> {
  if (signal?.aborted) return Promise.resolve(null);
  if (pending.size > 0) {
    return Promise.reject(new Error("another input request is pending"));
  }
  const id = nextId++;
  return new Promise<Record<string, string> | null>((resolve) => {
    let settled = false;
    const timer: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => settle(null),
      INPUT_TIMEOUT_MS,
    );

    const settle = (answers: Record<string, string> | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      pending.delete(id);
      signal?.removeEventListener("abort", onAbort);
      // Every settle path announces itself so clients can drop the dialog —
      // input:cancel doubles as the "answered elsewhere" signal.
      events.emitEvent("input:cancel", { id });
      resolve(answers);
    };

    const onAbort = () => settle(null);

    pending.set(id, { settle });
    signal?.addEventListener("abort", onAbort, { once: true });

    const request: InputRequest = {
      id,
      ...req,
      host: os.hostname(),
    };
    events.emitEvent("input:request", request);
  });
}

/** Returns false when there is no pending request under this id. */
export function resolveUserInput(
  id: number,
  answers?: Record<string, string>,
): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  entry.settle(answers ?? null);
  return true;
}
