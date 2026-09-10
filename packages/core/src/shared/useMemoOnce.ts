import { useState } from "react";

/**
 * Like useMemo, but the value is computed exactly once and never recomputed.
 * For objects (a socket, an RPC client) whose constructor must not run twice
 * even under StrictMode's double-invoke.
 */
export function useMemoOnce<T>(factory: () => T): T {
  const [value] = useState(factory);
  return value;
}
