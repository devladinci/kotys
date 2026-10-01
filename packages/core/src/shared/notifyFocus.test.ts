import { describe, expect, it } from "vitest";
import { shouldShowNotification } from "./notifyFocus.js";

const FOCUSED = { isVisible: true, hasFocus: true };
const AWAY = { isVisible: true, hasFocus: false };
const HIDDEN = { isVisible: false, hasFocus: false };

describe("shouldShowNotification", () => {
  it.each([
    ["the window is behind another app", AWAY],
    ["the page is hidden", HIDDEN],
  ])("shows a chat reply when %s", (_, focus) => {
    expect(shouldShowNotification({ chatId: 7 }, focus)).toBe(true);
  });

  it("stays quiet about a chat reply while the user is looking at Kotys", () => {
    expect(shouldShowNotification({ chatId: 7 }, FOCUSED)).toBe(false);
  });

  it("shows a reminder even while the user is looking at Kotys", () => {
    expect(shouldShowNotification({}, FOCUSED)).toBe(true);
  });
});
