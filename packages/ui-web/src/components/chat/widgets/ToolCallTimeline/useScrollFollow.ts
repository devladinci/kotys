import { useEffect, useRef } from "react";

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
