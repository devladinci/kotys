import { createPortal } from "react-dom";
import { useOverflowFlip, type HorizontalSide } from "../../useOverflowFlip";

const FLIP_UNDER_Y = 230;

function hoverCardStyle(
  rect: DOMRect,
  side: HorizontalSide,
): React.CSSProperties {
  const below = rect.top < FLIP_UNDER_Y;
  const vertical = below
    ? { top: rect.bottom + 8 }
    : { bottom: window.innerHeight - rect.top + 8 };
  const horizontal =
    side === "center"
      ? { left: rect.left + rect.width / 2, transform: "translateX(-50%)" }
      : side === "right"
        ? { right: 8 }
        : { left: 8 };
  return {
    position: "fixed",
    maxWidth: 320,
    zIndex: 50,
    ...vertical,
    ...horizontal,
  };
}

interface IHoverCardProps {
  children: React.ReactNode;
  rect: DOMRect;
}

export function HoverCard({ children, rect }: IHoverCardProps) {
  const [ref, side] = useOverflowFlip<HTMLDivElement>(true);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={hoverCardStyle(rect, side)}
      className="pointer-events-none rounded-lg border border-border bg-surface shadow-lg p-2.5 text-left"
    >
      {children}
    </div>,
    document.body,
  );
}
