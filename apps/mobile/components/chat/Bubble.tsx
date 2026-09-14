import { memo, useCallback, useState } from "react";
import {
  ActionSheetIOS,
  Image,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { setStringAsync } from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import { Ionicons } from "@expo/vector-icons";
import { asDataUriImage, isErrorTurn } from "@kotys/contracts";
import {
  SKILL_FENCE_PREFIX,
  SkillMessage,
  splitContentByWidgets,
} from "@kotys/core";
import type { Message } from "@kotys/core";
import { theme, useThemeMode } from "../../lib/theme";
import { InputCard, ToolTimeline } from "../kit";
import { s } from "./styles";

interface IProps {
  message: Message;
  streaming: boolean;
  highlighted: boolean;
  busy: boolean;
  onRegenerate: (id: number) => void;
  onEdit: (m: Message) => void;
}

const segmentGap = { marginTop: 4, marginBottom: 4 };
const imageRow = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: 6,
};

function BubbleBase({
  message,
  streaming,
  highlighted,
  busy,
  onRegenerate,
  onEdit,
}: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const isUser = message.role === "user";
  const [thinkOpen, setThinkOpen] = useState(false);

  const handleEdit = () => onEdit(message);
  const handleCopy = () => void setStringAsync(message.content);

  const longPress = useCallback(() => {
    if (streaming || busy) return;
    if (isUser) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Edit & resend", "Copy", "Cancel"], cancelButtonIndex: 2 },
        (idx) => {
          if (idx === 0) handleEdit();
          if (idx === 1) handleCopy();
        },
      );
    } else {
      const failed = isErrorTurn(message.content);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: failed
            ? ["Retry", "Regenerate", "Copy", "Cancel"]
            : ["Regenerate", "Copy", "Cancel"],
          cancelButtonIndex: failed ? 3 : 2,
        },
        (idx) => {
          if (failed) {
            if (idx === 0 || idx === 1) onRegenerate(message.id);
          } else if (idx === 0) {
            onRegenerate(message.id);
          }
          if (idx === (failed ? 2 : 1)) handleCopy();
        },
      );
    }
    // handleEdit/handleCopy are stable per-render closures over props below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, isUser, streaming, busy, onEdit, onRegenerate]);

  return (
    <Pressable onLongPress={longPress} delayLongPress={350}>
      <View
        style={[
          isUser ? s.bubbleUser : s.bubbleAssistant,
          isUser ? { backgroundColor: t.surfaceUser } : null,
          highlighted ? { borderWidth: 1, borderColor: t.accent } : null,
        ]}
      >
        {message.model && !isUser ? (
          <Text style={{ color: t.textMuted, fontSize: 11, marginBottom: 4 }}>
            {message.model}
            {streaming ? " · streaming…" : ""}
          </Text>
        ) : null}
        {!isUser && message.thinking ? (
          <Pressable
            onPress={() => setThinkOpen((v) => !v)}
            style={[s.thinkToggle, { borderColor: t.border }]}
            hitSlop={4}
          >
            <Ionicons name="sparkles" size={12} color={t.accent} />
            <Text style={{ color: t.textMuted, fontSize: 12 }}>
              {streaming && !message.content ? "Thinking…" : "Thinking"}
            </Text>
            <Ionicons
              name={thinkOpen ? "chevron-up" : "chevron-down"}
              size={13}
              color={t.textMuted}
            />
          </Pressable>
        ) : null}
        {thinkOpen && message.thinking ? (
          <View style={[s.thinkBox, { borderLeftColor: t.border }]}>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>
              {message.thinking}
            </Text>
          </View>
        ) : null}
        {message.toolCalls && message.toolCalls.length > 0 && !isUser ? (
          <View style={{ marginBottom: 6 }}>
            <ToolTimeline calls={message.toolCalls} streaming={streaming} />
          </View>
        ) : null}
        {isUser ? (
          <>
            {message.images && message.images.length > 0 ? (
              <View style={s.bubbleImages}>
                {message.images.map((src) => (
                  <Image
                    key={asDataUriImage(src)}
                    source={{ uri: asDataUriImage(src) }}
                    style={s.bubbleImage}
                  />
                ))}
              </View>
            ) : null}
            {message.content ? (
              <Markdown style={markdownStyles(t)} rules={markdownRules(t)}>
                {SkillMessage.fromContent(message.content)?.displayContent ??
                  message.content}
              </Markdown>
            ) : null}
          </>
        ) : (
          splitContentByWidgets(message.content, message.toolCalls ?? []).map(
            (segment) =>
              segment.kind === "text" ? (
                <Markdown
                  key={segment.id}
                  style={markdownStyles(t)}
                  rules={markdownRules(t)}
                >
                  {segment.text || (streaming ? "…" : "")}
                </Markdown>
              ) : segment.widget.kind === "input" ? (
                <View key={segment.id} style={segmentGap}>
                  <InputCard widget={segment.widget} />
                </View>
              ) : segment.widget.kind === "image" ? (
                <View key={segment.id} style={imageRow}>
                  {segment.widget.images.map((img) => (
                    <Image
                      key={asDataUriImage(img)}
                      source={{ uri: asDataUriImage(img) }}
                      style={s.bubbleImage}
                      resizeMode="cover"
                    />
                  ))}
                </View>
              ) : null,
          )
        )}
      </View>
    </Pressable>
  );
}

const Bubble = memo(BubbleBase);

const keyExtractor = (m: Message) => String(m.id);

const skillPillStyles = (t: ReturnType<typeof theme>) => ({
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    gap: 6,
    backgroundColor: `${t.accent}1f`,
    borderColor: `${t.accent}66`,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginVertical: 2,
  },
  name: {
    color: t.text,
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontWeight: "600" as const,
  },
});

const markdownStyles = (t: ReturnType<typeof theme>) => ({
  body: { color: t.text, fontSize: 15 },
  strong: { color: t.text, fontWeight: "700" as const },
  em: { color: t.text },
  code_inline: {
    backgroundColor: t.surface2,
    color: t.text,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  fence: {
    backgroundColor: t.surface2,
    color: t.text,
    borderRadius: t.radius.md,
  },
  heading1: { color: t.text, fontWeight: "700" as const },
  heading2: { color: t.text, fontWeight: "700" as const },
  heading3: { color: t.text, fontWeight: "600" as const },
  link: { color: t.accent },
  bullet_list_icon: { color: t.textMuted },
});

const markdownRules = (t: ReturnType<typeof theme>) => ({
  fence: (node: { key?: string; sourceInfo?: string; content?: string }) => {
    const language = node.sourceInfo ?? "";
    if (language.startsWith(SKILL_FENCE_PREFIX)) {
      return (
        <View key={node.key} style={skillPillStyles(t).row}>
          <Ionicons name="flash" size={12} color={t.accent} />
          <Text style={skillPillStyles(t).name}>
            {language.slice(SKILL_FENCE_PREFIX.length)}
          </Text>
        </View>
      );
    }
    return (
      <Text key={node.key} style={markdownStyles(t).fence}>
        {(node.content ?? "").replace(/\n$/, "")}
      </Text>
    );
  },
});

export { Bubble, keyExtractor };
