import { memo, useCallback, useState } from "react";
import { ActionSheetIOS, Image, Pressable, Text, View } from "react-native";
import { setStringAsync } from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import { Ionicons } from "@expo/vector-icons";
import { asDataUriImage, isErrorTurn, isSteerActivity } from "@kotys/contracts";
import {
  SKILL_FENCE_PREFIX,
  SkillMessage,
  splitContentByWidgets,
} from "@kotys/core";
import type { ContentSegment, Message } from "@kotys/core";
import { theme, useThemeMode } from "../../lib/theme";
import type { ThemeMode } from "../../lib/theme";
import { InputCard } from "../kit/InputCard";
import { ToolTimeline } from "../kit/ToolTimeline";
import { markdownStyles, s, themedStyles } from "./styles";

interface IProps {
  message: Message;
  isStreaming: boolean;
  isHighlighted: boolean;
  isBusy: boolean;
  onRegenerate: (id: number) => void;
  onEdit: (m: Message) => void;
}

interface IFenceNode extends ASTNode {
  sourceInfo?: string;
}

const EDIT_RESEND = "Edit & resend";
const RETRY = "Retry";
const REGENERATE = "Regenerate";
const COPY = "Copy";
const CANCEL = "Cancel";
const USER_ACTIONS = [EDIT_RESEND, COPY, CANCEL];
const REPLY_ACTIONS = [REGENERATE, COPY, CANCEL];
const FAILED_REPLY_ACTIONS = [RETRY, ...REPLY_ACTIONS];

const longPressActions = (isUser: boolean, content: string) => {
  if (isUser) return USER_ACTIONS;
  return isErrorTurn(content) ? FAILED_REPLY_ACTIONS : REPLY_ACTIONS;
};

const displayText = (content: string) =>
  SkillMessage.fromContent(content)?.displayContent ?? content;

const imageSources = (images: string[]) =>
  images.map((image) => ({ uri: asDataUriImage(image) }));

const createMarkdownRules = (mode: ThemeMode): RenderRules => {
  const t = theme(mode);
  const ts = themedStyles[mode];
  const md = markdownStyles[mode];
  return {
    fence: (node: IFenceNode) => {
      const language = node.sourceInfo ?? "";
      if (language.startsWith(SKILL_FENCE_PREFIX)) {
        return (
          <View key={node.key} style={[s.skillPill, ts.skillPill]}>
            <Ionicons name="flash" size={12} color={t.accent} />
            <Text style={[s.skillPillName, ts.text]}>
              {language.slice(SKILL_FENCE_PREFIX.length)}
            </Text>
          </View>
        );
      }
      return (
        <Text key={node.key} style={md.fence}>
          {(node.content ?? "").replace(/\n$/, "")}
        </Text>
      );
    },
  };
};

const markdownRules = {
  light: createMarkdownRules("light"),
  dark: createMarkdownRules("dark"),
};

function BubbleBase({
  message,
  isStreaming,
  isHighlighted,
  isBusy,
  onRegenerate,
  onEdit,
}: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const md = markdownStyles[mode];
  const rules = markdownRules[mode];
  const isUser = message.role === "user";
  const [thinkOpen, setThinkOpen] = useState(false);

  const toolCalls = (message.toolCalls ?? []).filter(
    (tc) => !isSteerActivity(tc),
  );

  const handleLongPress = useCallback(() => {
    if (isStreaming || isBusy) return;
    const options = longPressActions(isUser, message.content);
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1 },
      (idx) => {
        const action = options[idx];
        if (action === EDIT_RESEND) onEdit(message);
        if (action === COPY) void setStringAsync(message.content);
        if (action === RETRY || action === REGENERATE) onRegenerate(message.id);
      },
    );
  }, [message, isUser, isStreaming, isBusy, onEdit, onRegenerate]);

  const handleToggleThinking = () => setThinkOpen((open) => !open);

  const renderSegment = (segment: ContentSegment) => {
    if (segment.kind === "text") {
      return (
        <Markdown key={segment.id} style={md} rules={rules}>
          {segment.text || (isStreaming ? "…" : "")}
        </Markdown>
      );
    }
    const { widget } = segment;
    if (widget.kind === "input") {
      return (
        <View key={segment.id} style={s.segmentGap}>
          <InputCard widget={widget} />
        </View>
      );
    }
    if (widget.kind === "image") {
      return (
        <View key={segment.id} style={s.widgetImages}>
          {imageSources(widget.images).map((source) => (
            <Image
              key={source.uri}
              source={source}
              style={s.bubbleImage}
              resizeMode="cover"
            />
          ))}
        </View>
      );
    }
    if (widget.kind === "steer") {
      return (
        <View
          key={segment.id}
          style={[s.bubbleUser, s.segmentGap, ts.userBubble]}
        >
          <View style={s.steerLabel}>
            <Ionicons
              name="return-down-forward"
              size={10}
              color={t.textMuted}
            />
            <Text style={[s.steerLabelText, ts.mutedText]}>Sent mid-reply</Text>
          </View>
          <Markdown style={md} rules={rules}>
            {displayText(widget.text)}
          </Markdown>
        </View>
      );
    }
    return null;
  };

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={350}>
      <View
        style={[
          isUser ? s.bubbleUser : s.bubbleAssistant,
          isUser ? ts.userBubble : null,
          isHighlighted ? ts.highlighted : null,
        ]}
      >
        {message.model && !isUser ? (
          <Text style={[s.modelLabel, ts.mutedText]}>
            {message.model}
            {isStreaming ? " · streaming…" : ""}
          </Text>
        ) : null}
        {!isUser && message.thinking ? (
          <Pressable
            onPress={handleToggleThinking}
            style={[s.thinkToggle, ts.thinkToggle]}
            hitSlop={4}
          >
            <Ionicons name="sparkles" size={12} color={t.accent} />
            <Text style={[s.thinkText, ts.mutedText]}>
              {isStreaming && !message.content ? "Thinking…" : "Thinking"}
            </Text>
            <Ionicons
              name={thinkOpen ? "chevron-up" : "chevron-down"}
              size={13}
              color={t.textMuted}
            />
          </Pressable>
        ) : null}
        {thinkOpen && message.thinking ? (
          <View style={[s.thinkBox, ts.thinkBox]}>
            <Text style={[s.thinkText, ts.mutedText]}>{message.thinking}</Text>
          </View>
        ) : null}
        {toolCalls.length > 0 && !isUser ? (
          <View style={s.toolTimeline}>
            <ToolTimeline calls={toolCalls} isStreaming={isStreaming} />
          </View>
        ) : null}
        {isUser ? (
          <>
            {message.images && message.images.length > 0 ? (
              <View style={s.bubbleImages}>
                {imageSources(message.images).map((source) => (
                  <Image
                    key={source.uri}
                    source={source}
                    style={s.bubbleImage}
                  />
                ))}
              </View>
            ) : null}
            {message.content ? (
              <Markdown style={md} rules={rules}>
                {displayText(message.content)}
              </Markdown>
            ) : null}
          </>
        ) : (
          splitContentByWidgets(message.content, message.toolCalls ?? []).map(
            renderSegment,
          )
        )}
      </View>
    </Pressable>
  );
}

export const Bubble = memo(BubbleBase);
