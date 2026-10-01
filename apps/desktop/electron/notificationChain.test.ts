import { beforeEach, expect, it, vi } from "vitest";
import { shouldShowNotification } from "@kotys/core";

/**
 * Pushes a payload through the real renderer, bridge and main-process layers.
 * Each layer is unit-tested on its own, so a field dropped in a seam between
 * them still passes every other test in the repo.
 */
const banners: { title: string; body: string }[] = [];

vi.mock("electron", () => ({
  Notification: class {
    #options: { title: string; body: string };
    constructor(options: { title: string; body: string }) {
      this.#options = options;
    }
    show() {
      banners.push(this.#options);
    }
    static isSupported = () => true;
  },
}));

const { plausibleNotify, showNotification } = await import("./notify");
const { desktopPlatform } = await import("@kotys/ui-web");

type IBridgePayload = { title: string; body: string; chatId?: number };

const sentOverIpc: unknown[] = [];
let pending: unknown;

const windowFocused = { isFocused: () => true };
const windowAway = { isFocused: () => false };

/** One turn of the chain: decide, notify, cross the bridge, show. */
const deliver = (
  payload: { title: string; body: string; chatId?: number },
  focus: { isVisible: boolean; hasFocus: boolean },
  mainWindow: { isFocused: () => boolean } | null,
) => {
  if (!shouldShowNotification(payload, focus)) return;

  const { title, body, chatId } = payload;
  desktopPlatform.notify({ title, body, chatId });
  pending = sentOverIpc.at(-1);

  const received: unknown = sentOverIpc.at(-1);
  if (plausibleNotify(received)) {
    showNotification(received as IBridgePayload, mainWindow);
  }
};

beforeEach(() => {
  banners.length = 0;
  sentOverIpc.length = 0;
  pending = undefined;
  (globalThis as unknown as { window: unknown }).window = {
    kotys: {
      notify: (payload: IBridgePayload) => void sentOverIpc.push(payload),
    },
  };
});

it("carries a reminder all the way to the banner while the user is looking at Kotys", () => {
  deliver(
    { title: "Task reminder", body: "Pay invoice" },
    { isVisible: true, hasFocus: true },
    windowFocused,
  );

  expect(banners).toEqual([{ title: "Task reminder", body: "Pay invoice" }]);
});

it("carries a finished reply to the banner while the window is behind another app", () => {
  deliver(
    { title: "Kotys", body: "Deploy done.", chatId: 7 },
    { isVisible: true, hasFocus: false },
    windowAway,
  );

  expect(banners).toEqual([{ title: "Kotys", body: "Deploy done." }]);
});

it("shows no banner for a reply the user is already reading", () => {
  deliver(
    { title: "Kotys", body: "Deploy done.", chatId: 7 },
    { isVisible: true, hasFocus: true },
    windowFocused,
  );

  expect(banners).toHaveLength(0);
});

it("hands the bridge the chatId it needs to tell a reply from a reminder", () => {
  deliver(
    { title: "Kotys", body: "Deploy done.", chatId: 7 },
    { isVisible: true, hasFocus: false },
    windowAway,
  );

  expect(sentOverIpc).toHaveLength(1);
  expect(pending).toEqual({ title: "Kotys", body: "Deploy done.", chatId: 7 });
});

it("keeps a reply off the screen when the window claims a focus the page did not", () => {
  // Only the main process can settle this disagreement, and only if the
  // preload bridge carried the chatId across.
  deliver(
    { title: "Kotys", body: "Deploy done.", chatId: 7 },
    { isVisible: true, hasFocus: false },
    windowFocused,
  );

  expect(banners).toHaveLength(0);
});
