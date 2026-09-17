import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useOverflowFlip } from "./useOverflowFlip";

// A popup that would hang off the left edge when centered, and fits once it
// is anchored left.
const stubRects = () => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const centered = this.dataset?.side === "center";
    return {
      left: centered ? -40 : 80,
      right: centered ? 280 : 400,
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
};

function Popup() {
  const [open, setOpen] = useState(false);
  const [ref, side] = useOverflowFlip<HTMLDivElement>(open);
  const handleToggle = () => setOpen((o) => !o);
  return (
    <div>
      <button onClick={handleToggle}>toggle</button>
      {open && <div data-testid="popup" ref={ref} data-side={side} />}
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOverflowFlip", () => {
  it("anchors the same way every time it opens", async () => {
    const restore = stubRects();
    try {
      render(<Popup />);
      const sides: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        await userEvent.click(screen.getByText("toggle"));
        sides.push(screen.getByTestId("popup").dataset.side ?? "");
        await userEvent.click(screen.getByText("toggle"));
      }
      expect(sides).toEqual(["left", "left", "left"]);
    } finally {
      restore();
    }
  });
});
