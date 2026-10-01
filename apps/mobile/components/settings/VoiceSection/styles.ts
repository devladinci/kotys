import { StyleSheet } from "react-native";
import { theme } from "../../../lib/theme";
import type { ThemeMode } from "../../../lib/theme";

export const s = StyleSheet.create({
  content: {
    padding: 16,
    gap: 18,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  hint: {
    fontSize: 12,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputText: {
    fontSize: 14,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  rowText: {
    flex: 1,
    fontSize: 14,
  },
});

const createThemedStyles = (mode: ThemeMode) => {
  const t = theme(mode);

  return StyleSheet.create({
    card: {
      backgroundColor: t.surface,
      borderColor: t.border,
    },
    input: {
      backgroundColor: t.bg,
      borderColor: t.border,
    },
    rowCard: {
      backgroundColor: t.surface,
      borderColor: t.border,
    },
    text: {
      color: t.text,
    },
    mutedText: {
      color: t.textMuted,
    },
    dangerText: {
      color: t.danger,
    },
    selectedText: {
      color: t.accent,
      fontWeight: "700",
    },
  });
};

export const themedStyles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
};
