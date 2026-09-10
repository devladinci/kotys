import { describe, expect, it } from "vitest";
import {
  PAST_DATE_GRACE_S,
  pastDateError,
  validateNewTodoDates,
  validateTodoDateChanges,
} from "./todoDates";

const NOW = Math.floor(new Date(2026, 7, 17, 12, 0).getTime() / 1000);
const MINUTE = 60;
const HOUR = 3_600;

describe("validateNewTodoDates", () => {
  it("accepts future dates", () => {
    expect(
      validateNewTodoDates(
        { due_at: NOW + HOUR, notify_at: NOW + MINUTE * 30 },
        NOW,
      ),
    ).toBeNull();
  });

  it("accepts a task with no dates at all", () => {
    expect(validateNewTodoDates({}, NOW)).toBeNull();
    expect(
      validateNewTodoDates({ due_at: null, notify_at: null }, NOW),
    ).toBeNull();
  });

  it("rejects a due date in the past", () => {
    expect(validateNewTodoDates({ due_at: NOW - HOUR }, NOW)).toMatch(
      /^Due date is in the past/,
    );
  });

  it("rejects a reminder in the past", () => {
    expect(validateNewTodoDates({ notify_at: NOW - HOUR }, NOW)).toMatch(
      /^Reminder is in the past/,
    );
  });

  it("reports the due date first when both are in the past", () => {
    expect(
      validateNewTodoDates({ due_at: NOW - HOUR, notify_at: NOW - HOUR }, NOW),
    ).toMatch(/^Due date/);
  });

  // datetime-local rounds to the minute, so picking the current minute at :45
  // yields a timestamp already behind the clock. Rejecting that would force
  // users to always pick the *next* minute.
  it("tolerates the current minute", () => {
    expect(
      validateNewTodoDates({ due_at: NOW - PAST_DATE_GRACE_S + 1 }, NOW),
    ).toBeNull();
    expect(
      validateNewTodoDates({ due_at: NOW - PAST_DATE_GRACE_S - 1 }, NOW),
    ).not.toBeNull();
  });
});

describe("validateTodoDateChanges", () => {
  const overdue = { due_at: NOW - 365 * 24 * HOUR, notify_at: NOW - HOUR };

  // The four year-old car tasks have to stay renameable.
  it("lets an already-overdue task be edited without rescheduling", () => {
    expect(validateTodoDateChanges({}, overdue, NOW)).toBeNull();
    expect(
      validateTodoDateChanges(
        { due_at: overdue.due_at, notify_at: overdue.notify_at },
        overdue,
        NOW,
      ),
    ).toBeNull();
  });

  it("rejects moving a due date further into the past", () => {
    expect(
      validateTodoDateChanges({ due_at: NOW - HOUR }, overdue, NOW),
    ).toMatch(/^Due date is in the past/);
  });

  it("accepts rescheduling an overdue task into the future", () => {
    expect(
      validateTodoDateChanges(
        { due_at: NOW + HOUR, notify_at: NOW + MINUTE },
        overdue,
        NOW,
      ),
    ).toBeNull();
  });

  it("accepts clearing a date", () => {
    expect(
      validateTodoDateChanges({ due_at: null, notify_at: null }, overdue, NOW),
    ).toBeNull();
  });
});

describe("pastDateError", () => {
  it("names the field it is complaining about", () => {
    expect(pastDateError("due_at", NOW - HOUR, NOW)).toContain("Due date");
    expect(pastDateError("notify_at", NOW - HOUR, NOW)).toContain("Reminder");
  });

  it("passes null and undefined through", () => {
    expect(pastDateError("due_at", null, NOW)).toBeNull();
    expect(pastDateError("due_at", undefined, NOW)).toBeNull();
  });
});
