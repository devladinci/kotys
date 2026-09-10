import { describe, expect, it } from "vitest";
import { fmtElapsed, fmtHistoryDate } from "./format";

// Regression guard for the 1970 bug: started_at is epoch SECONDS and must be
// multiplied before any Date call. If the *1000 is dropped, every row
// renders "Jan 1 1970" and these two assertions fail.
describe("fmtHistoryDate", () => {
  it("renders a real date from the seconds epoch, not Jan 1970", () => {
    const out = fmtHistoryDate(1_789_000_000);
    expect(out).not.toContain("1970");
    expect(out).not.toContain("Invalid Date");
    expect(out).toMatch(/·/);
  });

  it("changes when the session changes", () => {
    expect(fmtHistoryDate(1_789_000_000)).not.toBe(
      fmtHistoryDate(1_790_000_000),
    );
  });
});

describe("fmtElapsed", () => {
  it("shows whole minutes", () => {
    expect(fmtElapsed(1_500)).toBe("25m");
    expect(fmtElapsed(0)).toBe("0m");
    expect(fmtElapsed(59)).toBe("1m");
  });
});
