import { useCallback } from "react";
import { create } from "zustand";
import type { InputRequest } from "@kotys/contracts";
import { getSocket } from "../shared/clients.js";

/**
 * Pending input requests must survive screen unmounts: on mobile the chat
 * screen mounts on demand, after the broadcast it needs to display. State
 * lives here (one subscriber at app root), not in component state.
 */
type UserInputState = {
  pending: InputRequest | null;
  setPending: (r: InputRequest | null) => void;
  resolved: (id: number) => void;
};

/** Exported for tests; the hook below is the public API. */
export const useUserInputStore = create<UserInputState>((set) => ({
  pending: null,
  setPending: (r) => set({ pending: r }),
  resolved: (id) =>
    set((s) => (s.pending && s.pending.id === id ? { pending: null } : s)),
}));

let subscribed = false;
export const subscribeUserInput = () => {
  if (subscribed) return;
  subscribed = true;
  getSocket().on((msg) => {
    const s = useUserInputStore.getState();
    if (msg.type === "input:request") {
      s.setPending(msg.payload);
    } else if (msg.type === "input:cancel") {
      s.resolved(msg.payload.id);
    }
  });
};

export function useUserInput() {
  const pending = useUserInputStore((s) => s.pending);

  const submit = useCallback(
    (answers: Record<string, string>) => {
      if (!pending) return;
      getSocket().send({
        type: "input:response",
        payload: { id: pending.id, answers },
      });
      useUserInputStore.getState().setPending(null);
    },
    [pending],
  );

  const cancel = useCallback(() => {
    if (!pending) return;
    getSocket().send({
      type: "input:response",
      payload: { id: pending.id, cancelled: true },
    });
    useUserInputStore.getState().setPending(null);
  }, [pending]);

  return { pending, submit, cancel };
}
