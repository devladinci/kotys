import { getSetting } from "@kotys/db";

// JSON Record<toolName, boolean> in the settings table; missing = enabled.
export const TOOLS_ENABLED_KEY = "tools_enabled";

export function getEnabledTools(): Record<string, boolean> {
  const raw = getSetting(TOOLS_ENABLED_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // corrupt setting — treat as all-default
  }
  return {};
}
