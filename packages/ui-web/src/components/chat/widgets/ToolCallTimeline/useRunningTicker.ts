import { useEffect, useState } from "react";
import type { ToolActivity } from "@kotys/contracts";

export function useRunningTicker(
  calls: ToolActivity[],
  isStreaming: boolean,
): number {
  const hasRunning =
    isStreaming || calls.some((tc) => tc?.status === "running");
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!hasRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [hasRunning]);

  return now;
}
