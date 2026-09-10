import { describe, expect, it } from "vitest";
import { asEpochSeconds } from "@kotys/contracts";
import { bucketFor, relTime } from "./chatBuckets.js";

const NOW = new Date("2026-09-10T12:00:00").getTime();
const sec = (ms: number) => asEpochSeconds(Math.floor(ms / 1000));

describe("bucketFor", () => {
  it("puts a chat updated this instant in today", () => {
    expect(bucketFor(sec(NOW), NOW)).toBe("today");
  });

  it("yesterday is 1 day back", () => {
    expect(bucketFor(sec(NOW - 86_400_000), NOW)).toBe("yesterday");
  });

  it("week / month / earlier tiers", () => {
    expect(bucketFor(sec(NOW - 3 * 86_400_000), NOW)).toBe("week");
    expect(bucketFor(sec(NOW - 10 * 86_400_000), NOW)).toBe("month");
    expect(bucketFor(sec(NOW - 40 * 86_400_000), NOW)).toBe("earlier");
  });

  it("is day-boundary aware, not raw 24h subtraction", () => {
    const now = new Date("2026-09-10T00:30:00").getTime();
    const yestEvening = new Date("2026-09-09T23:50:00").getTime();
    expect(bucketFor(sec(yestEvening), now)).toBe("yesterday");
  });
});

describe("relTime", () => {
  it("just now / minutes / hours-free tiers", () => {
    expect(relTime(sec(NOW - 30_000), NOW)).toBe("just now");
    expect(relTime(sec(NOW - 120_000), NOW)).toBe("2m ago");
  });

  it("same calendar day renders a clock time", () => {
    const out = relTime(sec(NOW - 3_600_000), NOW);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });

  it("a second back renders Yesterday", () => {
    const noon = new Date("2026-09-10T12:00:00").getTime();
    const yestNoon = new Date("2026-09-09T12:00:00").getTime();
    expect(relTime(sec(yestNoon), noon)).toBe("Yesterday");
  });
});
