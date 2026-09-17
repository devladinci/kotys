import { useLayoutEffect, useRef, useState } from "react";

export type HorizontalSide = "center" | "left" | "right";

const VIEWPORT_MARGIN = 8;

/**
 * Anchors an absolutely-positioned popup so it stays inside the window.
 * Renders centered first, then measures in a layout effect (before paint) and
 * flips to `right` (extends leftward) or `left` (extends rightward) when the
 * centered position would overflow either edge. `anchor` is whatever the
 * popup hangs off — an open flag, a rect — and a new one is measured again.
 */
export function useOverflowFlip<T extends HTMLElement>(
  anchor: unknown,
): [React.RefObject<T | null>, HorizontalSide] {
  const ref = useRef<T>(null);
  const [measured, setMeasured] = useState<{
    anchor: unknown;
    side: HorizontalSide;
  }>({ anchor, side: "center" });

  // Reset while rendering, not in an effect: measuring a popup that still
  // carries the previous flip reports that it fits, and it never flips back.
  if (measured.anchor !== anchor) setMeasured({ anchor, side: "center" });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - VIEWPORT_MARGIN) {
      setMeasured({ anchor, side: "right" });
    } else if (rect.left < VIEWPORT_MARGIN) {
      setMeasured({ anchor, side: "left" });
    }
  }, [anchor]);

  return [ref, measured.anchor === anchor ? measured.side : "center"];
}
