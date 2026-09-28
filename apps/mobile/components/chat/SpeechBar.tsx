import { Pressable, Text } from "react-native";
import { memo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSpeech } from "@kotys/core";
import { theme, useThemeMode } from "../../lib/theme";
import { s, themedStyles } from "./styles";

function SpeechBarBase() {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const speech = useSpeech();
  const isBusy = speech.status === "loading" || speech.status === "playing";

  if (!isBusy) return null;

  const label =
    speech.status === "loading"
      ? "Synthesizing…"
      : "Playing aloud — tap to stop";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={speech.stop}
      style={[s.speechBar, ts.speechBar]}
    >
      <Ionicons
        name={speech.status === "loading" ? "hourglass-outline" : "volume-high"}
        size={14}
        color={t.accent}
      />
      <Text numberOfLines={1} style={[s.speechBarText, ts.mutedText]}>
        {speech.text}
      </Text>
      <Ionicons name="close" size={14} color={t.textMuted} />
    </Pressable>
  );
}

export const SpeechBar = memo(SpeechBarBase);
