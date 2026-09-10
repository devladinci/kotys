import { describe, expect, it } from "vitest";
import {
  asEpochSeconds,
  asEpochMillis,
  toMillis,
  toSeconds,
  epochToDate,
  secondsToDate,
} from "@kotys/contracts";

describe("epoch helpers", () => {
  it("round-trips seconds through millis", () => {
    const s = asEpochSeconds(1_788_510_501);
    const ms = toMillis(s);
    expect(ms).toBe(1_788_510_501_000);
    expect(toSeconds(ms)).toBe(1_788_510_501);
  });

  it("epochToDate reads seconds correctly (the #11 bug)", () => {
    // 1788510501 s = 2026-09-04; treated as ms it is 1970-01-21.
    const d = epochToDate(toMillis(asEpochSeconds(1_788_510_501)));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September
    expect(d.getDate()).toBe(4);
  });

  it("toSeconds floors, so sub-second millis do not leak into s+1", () => {
    expect(toSeconds(asEpochMillis(1_788_510_501_999))).toBe(1_788_510_501);
  });

  it("secondsToDate handles the nullable-column case", () => {
    expect(secondsToDate(null)).toBeNull();
    expect(secondsToDate(asEpochSeconds(1_788_510_501))?.getFullYear()).toBe(
      2026,
    );
  });
});
