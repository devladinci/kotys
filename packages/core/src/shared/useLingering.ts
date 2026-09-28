import { useEffect, useState } from "react";

/**
 * Keeps a transient UI (player bar) alive after its activity ends: stays
 * true while `active` is true and for `graceMs` after, then flips false.
 */
export function useLingering(active: boolean, graceMs = 30_000): boolean {
  const [lingering, setLingering] = useState(active);

  useEffect(() => {
    if (active) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors external speech store into local visibility */
      setLingering(true);

      return undefined;
    }
    const timer = setTimeout(() => setLingering(false), graceMs);

    return () => clearTimeout(timer);
  }, [active, graceMs]);

  return lingering;
}