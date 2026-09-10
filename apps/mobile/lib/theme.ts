import { useColorScheme } from "react-native";
import { palette, radius, spacing, fontSize } from "@kotys/ui-tokens";
import { useAppStore } from "@kotys/core";

export type ThemeMode = "light" | "dark";

export function theme(mode: ThemeMode) {
  const p = mode === "dark" ? palette.dark : palette.light;
  return {
    bg: p.bg,
    surface: p.surface,
    surface2: p.surface2,
    surfaceUser: p.surfaceUser,
    border: p.border,
    text: p.text,
    textMuted: p.textMuted,
    accent: p.accent,
    accentHover: p.accentHover,
    danger: "#d73a49",
    ok: "#1a7f37",
    warn: "#f59e0b",
    radius,
    spacing,
    fontSize,
  };
}

/**
 * Resolves the app store's theme preference ("system" | "light" | "dark")
 * into a concrete mode, re-rendering on OS scheme changes and on store
 * updates. Defaults to dark like the web app before hydration resolves it.
 */
export function useThemeMode(): ThemeMode {
  const scheme = useColorScheme();
  const themePref = useAppStore((st) => st.theme);
  if (themePref === "light") return "light";
  if (themePref === "dark") return "dark";
  return scheme === "light" ? "light" : "dark";
}
