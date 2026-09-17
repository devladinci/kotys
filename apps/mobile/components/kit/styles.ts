import { StyleSheet } from "react-native";
import { theme } from "../../lib/theme";
import type { ThemeMode } from "../../lib/theme";

export const ON_ACCENT = "#fff";

export const s = StyleSheet.create({
  sheetContainer: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "82%",
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  grabber: { alignItems: "center", paddingVertical: 6 },
  grabberBar: { width: 38, height: 5, borderRadius: 3, opacity: 0.5 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700" },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 14 },
  modelList: { maxHeight: 420 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  rowBody: { flex: 1 },
  rowBodyWithIcon: { flex: 1, marginLeft: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 15, fontWeight: "500", flexShrink: 1 },
  defaultTag: { fontSize: 10, opacity: 0.7 },
  provider: { fontSize: 10, marginTop: 1 },
  hint: { fontSize: 12 },
  capabilities: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  sourceBadge: {
    fontSize: 9,
    fontWeight: "700",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
  empty: { textAlign: "center", paddingVertical: 20, fontSize: 13 },

  toolStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  toolStripLabel: { fontSize: 12 },
  toolList: { gap: 6, marginTop: 6 },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 8,
  },
  toolIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toolPulse: { opacity: 0.5 },
  toolHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolLabel: { fontSize: 13, flex: 1 },
  toolServer: {
    fontSize: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  toolFailed: { fontSize: 11, fontWeight: "600" },
  toolDuration: { fontSize: 11 },
  toolError: { fontSize: 11 },
  toolImages: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  toolImage: { width: 132, height: 88, borderRadius: 8, borderWidth: 1 },

  inputCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    marginBottom: 6,
  },
  inputCardRow: { flexDirection: "row", gap: 8 },
  inputCardIcon: { marginTop: 2 },
  inputCardBody: { flex: 1, minWidth: 0 },
  inputCardTitle: { fontSize: 14, fontWeight: "600" },
  inputCardDescription: { fontSize: 12, marginTop: 2 },
  inputField: { marginTop: 6 },
  inputFieldLabel: { fontSize: 11 },
  inputFieldValue: { fontSize: 12 },
  inputFieldMissing: { fontStyle: "italic" },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  badgePct: { fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
  usage: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  usageNote: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  compact: {
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "center",
  },
  compactLabel: { color: ON_ACCENT, fontWeight: "600", fontSize: 15 },
});

const createThemedStyles = (mode: ThemeMode) => {
  const t = theme(mode);
  return StyleSheet.create({
    sheet: { backgroundColor: t.surface },
    grabberBar: { backgroundColor: t.border },
    text: { color: t.text },
    mutedText: { color: t.textMuted },
    accentText: { color: t.accent },
    dangerText: { color: t.danger },
    search: { borderColor: t.border, backgroundColor: t.surface2 },
    rowActive: { backgroundColor: t.surface2 },
    toolRow: { borderColor: t.border },
    toolServer: { color: t.textMuted, borderColor: t.border },
    toolImage: { borderColor: t.border },
    inputCard: { borderColor: t.border, backgroundColor: t.surface },
    compact: { backgroundColor: t.accent },
  });
};

export const themedStyles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
};
