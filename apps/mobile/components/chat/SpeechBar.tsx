import { memo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSpeechActions, useSpeechBar } from "@kotys/core";
import { theme, useThemeMode } from "../../lib/theme";
import { s, themedStyles } from "./styles";

function SpeechBarBase() {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const { phase, text, error } = useSpeechBar();
  const { replay, stop } = useSpeechActions();

  if (phase === "idle") return null;

  const isActive = phase === "loading" || phase === "playing";
  const isError = phase === "error";
  const label =
    phase === "loading"
      ? "Preparing audio…"
      : isError
        ? (error ?? "Speech failed")
        : text;
  const iconColor = isError
    ? t.danger
    : phase === "done"
      ? t.textMuted
      : t.accent;

  return (
    <View style={[s.speechBar, ts.speechBar]} accessibilityLiveRegion="polite">
      {phase === "loading" ? (
        <ActivityIndicator size="small" color={t.accent} />
      ) : (
        <Ionicons
          name={isError ? "alert-circle" : "volume-high"}
          size={15}
          color={iconColor}
        />
      )}
      <Text
        numberOfLines={1}
        style={[s.speechBarText, isError ? ts.dangerText : ts.mutedText]}
      >
        {label}
      </Text>
      {isActive ? (
        <Pressable
          accessibilityRole="button"
          onPress={stop}
          style={[s.speechBarButton, ts.speechBarButton]}
          hitSlop={8}
        >
          <Ionicons name="stop" size={12} color={t.text} />
          <Text style={[s.speechBarButtonText, ts.text]}>Stop</Text>
        </Pressable>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={replay}
            style={[s.speechBarButton, ts.speechBarButton]}
            hitSlop={8}
          >
            <Ionicons name="refresh" size={12} color={t.text} />
            <Text style={[s.speechBarButtonText, ts.text]}>
              {isError ? "Retry" : "Replay"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={stop}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={t.textMuted} />
          </Pressable>
        </>
      )}
    </View>
  );
}

export const SpeechBar = memo(SpeechBarBase);
