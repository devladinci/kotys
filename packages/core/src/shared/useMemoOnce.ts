import { useState } from "react";

/**
 * Like useMemo, but the value is kept for the life of the component. React
 * still calls the factory twice under StrictMode, so a factory with side
 * effects (setClients) has to tolerate that itself.
 */
export function useMemoOnce<T>(factory: () => T): T {
  const [value] = useState(factory);
  return value;
}
