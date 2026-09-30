import { useMemo } from "react";
import type { IVoiceTheme } from "@saystack/react-native";
import { voiceTheme } from "@saystack/react-native";
import { theme, useThemeMode } from "./theme";

export function useVoiceTheme(): IVoiceTheme {
  const mode = useThemeMode();

  return useMemo(() => {
    const t = theme(mode);

    return voiceTheme(mode, {
      background: t.bg,
      surface: t.surface,
      surfaceMuted: t.surface2,
      border: t.border,
      text: t.text,
      textMuted: t.textMuted,
      accent: t.accent,
      accentInk: t.accentInk,
      danger: t.danger,
    });
  }, [mode]);
}
