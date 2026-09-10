import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { SkillListing } from "@kotys/contracts";
import { getRpc, getSocket } from "../shared/clients.js";

let cachedListings: SkillListing[] = [];
const listeners = new Set<() => void>();

function setCache(listings: SkillListing[]): void {
  cachedListings = listings;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Slash-invocable skills for the composer menu: cached, refreshed on
 * `skills:changed` broadcasts, and refetched on reconnect (broadcasts are
 * lost while disconnected).
 *
 * Excludes `user-invocable: false` — those are model-only.
 */
export function useSkills(): {
  skills: SkillListing[];
  refresh: () => Promise<void>;
} {
  const skills = useSyncExternalStore(subscribe, () => cachedListings);
  const refresh = useCallback(async () => {
    const list = await getRpc().skills.list();
    setCache(list.filter((s) => s.userInvocable));
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      // Daemon unreachable — keep whatever cache exists.
    });
    return getSocket().on((msg) => {
      if (msg.type === "skills:changed") void refresh();
    });
  }, [refresh]);

  return { skills, refresh };
}
