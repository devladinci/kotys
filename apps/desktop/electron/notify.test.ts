import { beforeEach, describe, expect, it, vi } from "vitest";

const shown: Record<string, unknown>[] = [];
const isSupported = vi.fn(() => true);

vi.mock("electron", () => ({
  Notification: class {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
    show() {
      shown.push(this.options);
    }
    static isSupported = isSupported;
  },
}));

const { plausibleNotify, showNotification } = await import("./notify");

// macOS stamps the bundle icon on its own; only other platforms get one
// passed explicitly, so the expected options differ per platform.
const bannerIcon =
  process.platform === "darwin"
    ? {}
    : { icon: expect.stringContaining("icon.png") };

const windowFocused = { isFocused: () => true };
const windowAway = { isFocused: () => false };

beforeEach(() => {
  shown.length = 0;
  isSupported.mockReturnValue(true);
});

describe("plausibleNotify", () => {
  it("accepts a shaped payload", () => {
    expect(plausibleNotify({ title: "Kotys", body: "Done." })).toBe(true);
  });

  it("rejects anything that is not a title/body pair", () => {
    expect(plausibleNotify(null)).toBe(false);
    expect(plausibleNotify("Kotys")).toBe(false);
    expect(plausibleNotify({ title: "Kotys" })).toBe(false);
    expect(plausibleNotify({ title: 1, body: "Done." })).toBe(false);
    expect(plausibleNotify({ title: "Kotys", body: { text: "Done." } })).toBe(
      false,
    );
  });

  it("accepts a chatId and rejects one that is not a number", () => {
    expect(plausibleNotify({ title: "Kotys", body: "Done.", chatId: 7 })).toBe(
      true,
    );
    expect(
      plausibleNotify({ title: "Kotys", body: "Done.", chatId: "7" }),
    ).toBe(false);
  });

  it("rejects a payload too big for a banner", () => {
    expect(plausibleNotify({ title: "t".repeat(201), body: "Done." })).toBe(
      false,
    );
    expect(plausibleNotify({ title: "Kotys", body: "b".repeat(2_001) })).toBe(
      false,
    );
  });
});

describe("showNotification", () => {
  it("shows a banner while the window is behind another app", () => {
    expect(
      showNotification({ title: "Kotys", body: "Done." }, windowAway),
    ).toBe(true);
    expect(shown).toEqual([{ title: "Kotys", body: "Done.", ...bannerIcon }]);
  });

  it("shows nothing while the user is looking at a reply", () => {
    expect(
      showNotification(
        { title: "Kotys", body: "Done.", chatId: 7 },
        windowFocused,
      ),
    ).toBe(false);
    expect(shown).toHaveLength(0);
  });

  it("still shows a reminder while the user is looking at the window", () => {
    expect(
      showNotification(
        { title: "Task reminder", body: "Pay invoice" },
        windowFocused,
      ),
    ).toBe(true);
    expect(shown).toEqual([{ title: "Task reminder", body: "Pay invoice" }]);
  });

  it("shows a banner on a platform that cannot, well, show banners", () => {
    isSupported.mockReturnValue(false);

    expect(
      showNotification({ title: "Kotys", body: "Done." }, windowAway),
    ).toBe(false);
    expect(shown).toHaveLength(0);
  });

  it("shows a banner before the window exists", () => {
    expect(showNotification({ title: "Kotys", body: "Done." }, null)).toBe(
      true,
    );
  });
});
