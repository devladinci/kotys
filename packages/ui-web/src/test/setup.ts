import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// prosemirror-view reads layout APIs jsdom does not implement.
const zeroRect: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => {},
} as DOMRect;
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
const emptyRectList = Object.assign([zeroRect], {
  item: (_: number): DOMRect | null => zeroRect,
}) as DOMRectList;
if (!Element.prototype.getClientRects) {
  Element.prototype.getClientRects = () => emptyRectList;
}
if (!Element.prototype.getBoundingClientRect) {
  Element.prototype.getBoundingClientRect = () => zeroRect;
}
if (!(Text.prototype as { getClientRects?: () => DOMRectList }).getClientRects) {
  (Text.prototype as { getClientRects?: () => DOMRectList }).getClientRects =
    () => emptyRectList;
}
if (!(Text.prototype as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect) {
  (Text.prototype as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect =
    () => zeroRect;
}
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => emptyRectList;
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => zeroRect;
}
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

afterEach(() => {
  cleanup();
});
