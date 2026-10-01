import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotifications } from "./useNotifications";

const mocks = vi.hoisted(() => ({
  listeners: new Set<(msg: unknown) => void>(),
  notify: vi.fn(),
}));

vi.mock("@kotys/core", async () => {
  const actual =
    await vi.importActual<typeof import("@kotys/core")>("@kotys/core");

  return {
    shouldShowNotification: actual.shouldShowNotification,
    useSocket: () => ({
      on: (cb: (msg: unknown) => void) => {
        mocks.listeners.add(cb);
        return () => mocks.listeners.delete(cb);
      },
    }),
    usePlatform: () => ({ notify: mocks.notify }),
  };
});

const deliver = (payload: Record<string, unknown>) => {
  for (const listener of [...mocks.listeners]) {
    listener({ type: "notify", payload });
  }
};

const setFocus = (isVisible: boolean, hasFocus: boolean) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (isVisible ? "visible" : "hidden"),
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(hasFocus);
};

let unmount = () => {};

beforeEach(() => {
  mocks.listeners.clear();
  mocks.notify.mockReset();
  const hook = renderHook(() => useNotifications());
  unmount = hook.unmount;
  return () => unmount();
});

describe("useNotifications", () => {
  it("shows a chat reply while the window is behind another app", () => {
    setFocus(true, false);

    act(() => deliver({ title: "Kotys", body: "Deploy done.", chatId: 7 }));

    expect(mocks.notify).toHaveBeenCalledWith({
      title: "Kotys",
      body: "Deploy done.",
    });
  });

  it("shows nothing for a chat reply while the user is looking at Kotys", () => {
    setFocus(true, true);

    act(() => deliver({ title: "Kotys", body: "Deploy done.", chatId: 7 }));

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("shows a chat reply when the page is hidden", () => {
    setFocus(false, false);

    act(() => deliver({ title: "Kotys", body: "Deploy done.", chatId: 7 }));

    expect(mocks.notify).toHaveBeenCalledWith({
      title: "Kotys",
      body: "Deploy done.",
    });
  });

  it("shows a reminder even while the user is looking at Kotys", () => {
    setFocus(true, true);

    act(() => deliver({ title: "Task reminder", body: "Pay invoice" }));

    expect(mocks.notify).toHaveBeenCalledWith({
      title: "Task reminder",
      body: "Pay invoice",
    });
  });

  it("ignores every other socket frame", () => {
    setFocus(true, false);

    act(() => {
      for (const listener of [...mocks.listeners]) {
        listener({ type: "chat:done", payload: { requestId: "r" } });
      }
    });

    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
