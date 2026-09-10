import { useCallback } from "react";
import { create } from "zustand";
import type { ApprovalRequest } from "@kotys/contracts";
import { getSocket } from "../shared/clients.js";

/**
 * Pending approvals must survive screen unmounts: on mobile the approval
 * screen mounts on demand, after the broadcast it needs to display. State
 * lives here (one subscriber at app root), not in component state.
 */
type ApprovalState = {
  pending: ApprovalRequest | null;
  setPending: (r: ApprovalRequest | null) => void;
  resolved: (id: number) => void;
};

const useApprovalStore = create<ApprovalState>((set) => ({
  pending: null,
  setPending: (r) => set({ pending: r }),
  resolved: (id) =>
    set((s) => (s.pending && s.pending.id === id ? { pending: null } : s)),
}));

let subscribed = false;
export const subscribeToolApprovals = () => {
  if (subscribed) return;
  subscribed = true;
  getSocket().on((msg) => {
    const s = useApprovalStore.getState();
    if (msg.type === "approval:request") {
      s.setPending(msg.payload);
    } else if (msg.type === "approval:cancel") {
      s.resolved(msg.payload.id);
    }
  });
};

export function useToolApproval() {
  const pending = useApprovalStore((s) => s.pending);

  const respond = useCallback(
    (approved: boolean) => {
      if (!pending) return;
      getSocket().send({
        type: "approval:response",
        payload: { id: pending.id, approved },
      });
      useApprovalStore.getState().setPending(null);
    },
    [pending],
  );

  const accept = useCallback(() => respond(true), [respond]);
  const reject = useCallback(() => respond(false), [respond]);

  return { pending, accept, reject };
}
