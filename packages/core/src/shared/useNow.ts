import { useEffect, useState } from "react";

/**
 * A wall clock that ticks on an interval. Date-derived UI (relative times,
 * Today/Yesterday buckets) otherwise freezes at the render that first
 * computed it — nothing re-renders just because time passed. Both platforms
 * use this one clock so sidebar dates can never drift apart.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
