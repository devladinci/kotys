import { describe, expect, it } from "vitest";
import type { TodoRecord, EpochSeconds } from "@kotys/contracts";
import { dueLabelFor, groupFor, isOverdue, reminderLabelFor } from "./dueMeta";

// Fixtures are written in wall-clock ms for readability; the API surface takes
// epoch seconds, so `at()` converts once at the seam.
const atMs = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m, d, h, min, 0, 0).getTime();

const at = (y: number, m: number, d: number, h = 0, min = 0): EpochSeconds =>
  Math.floor(atMs(y, m, d, h, min) / 1000) as EpochSeconds;

const makeTodo = (over: Partial<TodoRecord> = {}): TodoRecord =>
  ({
    id: 1,
    chat_id: null,
    title: "Task",
    description: null,
    status: "pending",
    priority: "medium",
    due_at: null,
    notify_at: null,
    notified: 0,
    completed_at: null,
    created_by: "user",
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
    sort_order: 1000,
    ...over,
  }) as TodoRecord;

// 17 Aug 2026, 08:17 local — the moment the bug was reported. Kept in ms:
// dueMeta's `now` models the UI clock, which ticks in ms.
const NOW = atMs(2026, 7, 17, 8, 17);

describe("dueLabelFor", () => {
  // Regression: a task due 17 Aug 2025 rendered as "Overdue · Aug 17 09:30 AM",
  // which reads exactly like "due today at 09:30" — so a year-old task looked
  // like it was not due yet.
  it("says how overdue a year-old task is, not which calendar day", () => {
    const label = dueLabelFor(
      makeTodo({ due_at: at(2025, 7, 17, 9, 30) }),
      NOW,
    );
    expect(label).toBe("1y overdue");
    expect(label).not.toMatch(/Aug 17$/);
  });

  it("scales the overdue label to the gap", () => {
    // 14 Aug 09:00 → 17 Aug 08:17 is 2d 23h, which floors to 2d.
    expect(dueLabelFor(makeTodo({ due_at: at(2026, 7, 14, 9, 0) }), NOW)).toBe(
      "2d overdue",
    );
    expect(dueLabelFor(makeTodo({ due_at: at(2026, 7, 17, 3, 17) }), NOW)).toBe(
      "5h overdue",
    );
    expect(dueLabelFor(makeTodo({ due_at: at(2026, 7, 17, 8, 5) }), NOW)).toBe(
      "12m overdue",
    );
  });

  it("keeps the clock time for tasks still ahead today", () => {
    expect(
      dueLabelFor(makeTodo({ due_at: at(2026, 7, 17, 9, 30) }), NOW),
    ).toMatch(/^Today /);
    expect(
      dueLabelFor(makeTodo({ due_at: at(2026, 7, 18, 9, 30) }), NOW),
    ).toMatch(/^Tomorrow /);
  });

  it("includes the year once the date leaves the current one", () => {
    expect(dueLabelFor(makeTodo({ due_at: at(2027, 2, 4) }), NOW)).toContain(
      "2027",
    );
    expect(
      dueLabelFor(makeTodo({ due_at: at(2026, 10, 4) }), NOW),
    ).not.toContain("2026");
  });

  it("does not call a completed task overdue", () => {
    const done = makeTodo({
      due_at: at(2025, 7, 17, 9, 30),
      status: "completed",
    });
    expect(isOverdue(done, NOW)).toBe(false);
    expect(groupFor(done, NOW)).toBe("completed");
    expect(dueLabelFor(done, NOW)).toContain("2025");
  });
});

describe("reminderLabelFor", () => {
  // Spelling the date out twice pushed the meta row onto a second line at the
  // default panel width; the due chip beside it already names the day.
  it("drops the date when the reminder shares the due date's day", () => {
    const due = at(2026, 7, 17, 11, 24);
    const label = reminderLabelFor(atMs(2026, 7, 17, 10, 24), NOW, due);
    expect(label).not.toMatch(/Aug/);
    expect(label).toMatch(/10.24/);
  });

  it("keeps the date when it differs from the due date", () => {
    const due = at(2026, 7, 18, 11, 24);
    expect(reminderLabelFor(atMs(2026, 7, 17, 10, 24), NOW, due)).toMatch(
      /Aug/,
    );
  });

  it("keeps the date when there is no due date at all", () => {
    expect(reminderLabelFor(atMs(2026, 7, 17, 10, 24), NOW, null)).toMatch(
      /Aug/,
    );
  });
});

describe("groupFor", () => {
  it("buckets by calendar day, not by 24-hour spans", () => {
    expect(groupFor(makeTodo({ due_at: at(2026, 7, 17, 23, 59) }), NOW)).toBe(
      "today",
    );
    expect(groupFor(makeTodo({ due_at: at(2026, 7, 18, 0, 1) }), NOW)).toBe(
      "tomorrow",
    );
    expect(groupFor(makeTodo({ due_at: at(2026, 7, 21) }), NOW)).toBe(
      "this_week",
    );
    expect(groupFor(makeTodo({ due_at: at(2026, 8, 30) }), NOW)).toBe("later");
    expect(groupFor(makeTodo({ due_at: null }), NOW)).toBe("no_date");
    expect(groupFor(makeTodo({ due_at: at(2025, 7, 17) }), NOW)).toBe(
      "overdue",
    );
  });
});
