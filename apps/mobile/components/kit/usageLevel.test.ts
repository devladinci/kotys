import { describe, expect, it } from "vitest";
import { usageLevel } from "./usageLevel";

describe("usageLevel", () => {
  it("stays normal below three quarters of the window", () => {
    expect(usageLevel(0)).toBe("normal");
    expect(usageLevel(74)).toBe("normal");
  });

  it("turns high at 75% and full at 90%", () => {
    expect(usageLevel(75)).toBe("high");
    expect(usageLevel(89)).toBe("high");
    expect(usageLevel(90)).toBe("full");
  });

  it("stays full past the window", () => {
    expect(usageLevel(112)).toBe("full");
  });
});
