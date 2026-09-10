import { useLayoutEffect, useRef, useState } from "react";

export type HorizontalSide = "center" | "left" | "right";

const VIEWPORT_MARGIN = 8;

/**
 * Anchors an absolutely-positioned popup so it stays inside the window.
 * Renders centered first, then measures in a layout effect (before paint) and
 * flips to `right` (extends leftward) or `left` (extends rightward) when the
 * centered position would overflow either edge.
 */
export function useOverflowFlip<T extends HTMLElement>(
  active: boolean,
): [React.RefObject<T | null>, HorizontalSide] {
  const ref = useRef<T>(null);
  const [side, setSide] = useState<HorizontalSide>("center");

  useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - VIEWPORT_MARGIN) setSide("right");
    else if (rect.left < VIEWPORT_MARGIN) setSide("left");
    else setSide("center");
  }, [active]);

  return [ref, side];
}
