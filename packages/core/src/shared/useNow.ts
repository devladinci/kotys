import { useEffect, useState } from "react";
import { clearExpiredGenerating } from "../chat/generating.js";

/**
 * A wall clock that ticks on an interval. Date-derived UI (relative times,
 * Today/Yesterday buckets) otherwise freezes at the render that first
 * computed it — nothing re-renders just because time passed. Both platforms
 * use this one clock so sidebar dates can never drift apart.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    clearExpiredGenerating();
    const id = setInterval(() => {
      clearExpiredGenerating();
      setNow(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
