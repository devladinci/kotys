import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MicButton from "./MicButton";

afterEach(() => {
  vi.useRealTimers();
});

const renderMic = () => {
  const calls: string[] = [];
  render(
    <MicButton
      status="idle"
      onStart={() => calls.push("start")}
      onStop={() => calls.push("stop")}
      onCancel={() => calls.push("cancel")}
    />,
  );
  const button = screen.getByRole("button", { name: "Hold to record voice" });
  button.setPointerCapture = () => undefined;
  return { calls, button };
};

const press = (button: HTMLElement, x = 10, y = 10) =>
  fireEvent.pointerDown(button, {
    pointerId: 1,
    button: 0,
    clientX: x,
    clientY: y,
  });

describe("MicButton", () => {
  it("holding, then letting go, dictates", () => {
    vi.useFakeTimers();
    const { calls, button } = renderMic();

    press(button);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(calls).toEqual(["start", "stop"]);
  });

  it("a quick tap is cancelled instead of sending a blip", () => {
    const { calls, button } = renderMic();

    press(button);
    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(calls).toEqual(["start", "cancel"]);
    expect(button.title).toBe("Hold longer to dictate");
  });

  it("dragging away before letting go cancels", () => {
    vi.useFakeTimers();
    const { calls, button } = renderMic();

    press(button);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 10, clientY: 120 });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(calls).toEqual(["start", "cancel"]);
  });
});
