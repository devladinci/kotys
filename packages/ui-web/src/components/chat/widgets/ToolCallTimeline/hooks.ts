import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

export function useTrackWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function useScrollFollow(
  trackRef: React.RefObject<HTMLDivElement | null>,
  hasOverflow: boolean,
): () => void {
  const userScrolled = useRef(false);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !hasOverflow) return;
    const onScroll = () => {
      userScrolled.current =
        el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [trackRef, hasOverflow]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || !hasOverflow || userScrolled.current) return;
    el.scrollLeft = el.scrollWidth;
  });

  return () => {
    userScrolled.current = false;
  };
}
