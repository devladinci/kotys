// Lenient parsing for the todo date arguments. Some clients hand numeric tool
// arguments over as strings, and silently dropping those values (or worse,
// treating them as "clear the date") hides the failure behind a success
// response. Accept the common shapes; reject only what is clearly garbage.

export type ParsedDateArg = { value: number | null } | { error: string };

/**
 * Accepts a finite number, a numeric string ("1789383600"), or an ISO 8601
 * string ("2026-09-14T11:00:00Z"). Returns the value in epoch seconds, or null
 * for an explicit null (clear the field).
 */
export const parseTodoDateArg = (
  field: "due_at" | "notify_at",
  raw: unknown,
): ParsedDateArg => {
  if (raw === null) return { value: null };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { error: `${field} is not a valid number.` };
    }
    return { value: Math.round(raw) };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return { value: null };
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return { value: Math.round(numeric) };
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return { value: Math.round(parsed / 1000) };
    return {
      error: `${field} is not a valid timestamp. Use Unix seconds or an ISO 8601 string like 2026-09-14T11:00:00Z.`,
    };
  }
  return { error: `${field} must be a Unix timestamp (seconds) or null.` };
};
