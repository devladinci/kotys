import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import DurationField from "./DurationField";
import { FOCUS_PRESETS } from "@kotys/core";

/** Mirrors real usage: the parent owns the value and feeds it back down. */
function Harness({
  initial = 1,
  onChange,
}: {
  initial?: number;
  onChange?: (v: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DurationField
        label="Focus"
        unit="min"
        value={value}
        min={1}
        max={120}
        presets={FOCUS_PRESETS}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("DurationField", () => {
  it("lets you clear the box and type a new number", async () => {
    const user = userEvent.setup();
    render(<Harness initial={1} />);
    const input = screen.getByLabelText("Focus (min)") as HTMLInputElement;

    // The reported bug: clamping on each keystroke turned the empty box into
    // the minimum, so deleting "1" to type "20" left you stuck on "1".
    await user.clear(input);
    expect(input.value).toBe("");

    await user.type(input, "20");
    expect(input.value).toBe("20");
    expect(screen.getByTestId("value").textContent).toBe("20");
  });

  it("keeps the previous value when the box is left empty", async () => {
    const user = userEvent.setup();
    render(<Harness initial={25} />);
    const input = screen.getByLabelText("Focus (min)") as HTMLInputElement;

    await user.clear(input);
    await user.tab();

    expect(input.value).toBe("25");
    expect(screen.getByTestId("value").textContent).toBe("25");
  });

  it("clamps an out-of-range value on blur, not while typing", async () => {
    const user = userEvent.setup();
    render(<Harness initial={25} />);
    const input = screen.getByLabelText("Focus (min)") as HTMLInputElement;

    await user.clear(input);
    await user.type(input, "999");
    // Still exactly what was typed while the box has focus.
    expect(input.value).toBe("999");

    await user.tab();
    expect(input.value).toBe("120");
    expect(screen.getByTestId("value").textContent).toBe("120");
  });

  it("sets the value from a preset and marks it selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={1} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "20" }));

    expect(onChange).toHaveBeenCalledWith(20);
    expect(
      screen.getByRole("button", { name: "20" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      (screen.getByLabelText("Focus (min)") as HTMLInputElement).value,
    ).toBe("20");
  });
});
