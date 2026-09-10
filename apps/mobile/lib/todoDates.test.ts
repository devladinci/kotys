import { describe, expect, it } from "vitest";
import { fromLocalInput, toLocalInput } from "./todoDates";

describe("fromLocalInput", () => {
  it("parses the datetime-local string as local wall-clock time", () => {
    const ts = fromLocalInput("2026-08-20T15:30");
    expect(ts).not.toBeNull();
    expect(new Date(ts! * 1000).getHours()).toBe(15);
    expect(new Date(ts! * 1000).getMinutes()).toBe(30);
  });

  it("empty string is null, garbage is null — never NaN", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("not-a-date")).toBeNull();
  });
});

describe("toLocalInput", () => {
  it("null renders as an empty string", () => {
    expect(toLocalInput(null)).toBe("");
  });
});

describe("round trip", () => {
  it("survives picker round trips without shifting by the TZ offset", () => {
    const original = fromLocalInput("2026-08-20T15:30")!;
    const back = toLocalInput(original);
    expect(back).toBe("2026-08-20T15:30");
    expect(fromLocalInput(back)).toBe(original);
  });
});
