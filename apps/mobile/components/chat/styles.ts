import { Platform, StyleSheet } from "react-native";
import { theme } from "../../lib/theme";
import type { ThemeMode } from "../../lib/theme";

export const ON_ACCENT = "#fff";

const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });

export const s = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingVertical: 10,
    paddingRight: 4,
  },
  listContent: {
    padding: 12,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  messageGap: {
    height: 4,
  },
  turnGap: {
    height: 16,
  },
  bubbleAssistant: {
    alignSelf: "stretch",
    paddingVertical: 2,
  },
  bubbleUser: {
    borderRadius: 18,
    borderBottomRightRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: "flex-end",
    maxWidth: "85%",
  },
  modelLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  toolTimeline: {
    marginBottom: 6,
  },
  segmentGap: {
    marginTop: 4,
    marginBottom: 4,
  },
  widgetImages: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  skillPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginVertical: 2,
  },
  skillPillName: {
    fontSize: 12,
    fontFamily: MONO_FONT,
    fontWeight: "600",
  },
  composerWrap: {
    gap: 6,
  },
  inputWrap: {
    paddingTop: 4,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 16,
    paddingRight: 6,
    marginHorizontal: 10,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    fontSize: 15,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 4,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendIdle: {
    backgroundColor: "transparent",
  },
  composerTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    marginTop: 2,
  },
  spacer: {
    flex: 1,
  },
  toolBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  toolChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
  },
  chipText: {
    fontSize: 12,
  },
  modelChipText: {
    fontSize: 12,
    maxWidth: 110,
  },
  queue: {
    paddingHorizontal: 10,
    gap: 4,
  },
  queueCaption: {
    fontSize: 11,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  queueText: {
    flex: 1,
    fontSize: 12,
  },
  injecting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  steerLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 2,
  },
  steerLabelText: {
    fontSize: 10,
  },
  thinkToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  thinkText: {
    fontSize: 12,
  },
  thinkBox: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    marginBottom: 8,
  },
  jump: {
    position: "absolute",
    bottom: 110,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  editBar: {
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editHint: {
    fontSize: 12,
  },
  editInput: {
    fontSize: 15,
    maxHeight: 90,
    paddingVertical: 6,
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
  },
  editBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 8,
  },
  editBtnText: {
    fontSize: 13,
  },
  resendText: {
    color: ON_ACCENT,
    fontSize: 13,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 10,
  },
  pendingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  pendingThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
  },
  pendingThumb: {
    width: "100%",
    height: "100%",
  },
  pendingRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleImages: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  bubbleImage: {
    width: 140,
    height: 140,
    borderRadius: 12,
  },
});

const createThemedStyles = (mode: ThemeMode) => {
  const t = theme(mode);
  return StyleSheet.create({
    screen: {
      backgroundColor: t.bg,
    },
    text: {
      color: t.text,
    },
    mutedText: {
      color: t.textMuted,
    },
    userBubble: {
      backgroundColor: t.surfaceUser,
    },
    highlighted: {
      borderWidth: 1,
      borderColor: t.accent,
    },
    skillPill: {
      backgroundColor: `${t.accent}1f`,
      borderColor: `${t.accent}66`,
    },
    composer: {
      backgroundColor: t.surface,
      borderColor: t.border,
    },
    slashMenu: {
      backgroundColor: t.surface,
      borderColor: t.border,
    },
    sendActive: {
      backgroundColor: t.accent,
    },
    sendRaised: {
      backgroundColor: t.surface2,
    },
    toolChip: {
      backgroundColor: t.surface2,
      borderColor: t.border,
    },
    queueRow: {
      backgroundColor: t.surface2,
      borderColor: t.border,
    },
    thinkToggle: {
      borderColor: t.border,
    },
    thinkBox: {
      borderLeftColor: t.border,
    },
    jump: {
      backgroundColor: t.surface,
      borderColor: t.border,
    },
    editBar: {
      backgroundColor: t.surface,
      borderTopColor: t.border,
    },
    editCancel: {
      borderColor: t.border,
    },
    editResend: {
      borderColor: t.accent,
      backgroundColor: t.accent,
    },
    pendingRemove: {
      backgroundColor: t.surface,
    },
  });
};

export const themedStyles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
};

const createMarkdownStyles = (mode: ThemeMode) => {
  const t = theme(mode);
  return StyleSheet.create({
    body: { color: t.text, fontSize: 15 },
    strong: { color: t.text, fontWeight: "700" },
    em: { color: t.text },
    code_inline: {
      backgroundColor: t.surface2,
      color: t.text,
      fontFamily: MONO_FONT,
    },
    fence: {
      backgroundColor: t.surface2,
      color: t.text,
      borderRadius: t.radius.md,
    },
    heading1: { color: t.text, fontWeight: "700" },
    heading2: { color: t.text, fontWeight: "700" },
    heading3: { color: t.text, fontWeight: "600" },
    link: { color: t.accent },
    bullet_list_icon: { color: t.textMuted },
  });
};

export const markdownStyles = {
  light: createMarkdownStyles("light"),
  dark: createMarkdownStyles("dark"),
};
