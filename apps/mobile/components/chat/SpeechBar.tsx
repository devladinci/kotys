import { Pressable, Text, View } from "react-native";
import { memo, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLingering, useSpeech } from "@kotys/core";
import { theme, useThemeMode } from "../../lib/theme";
import { s, themedStyles } from "./styles";

function SpeechBarBase() {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const speech = useSpeech();
  const isBusy = speech.status === "loading" || speech.status === "playing";
  const visible = useLingering(isBusy);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (isBusy) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors external speech store into local fade state */
      setFading(false);

      return;
    }
    if (!visible) return;
    const timer = setTimeout(() => setFading(true), 27_000);

    return () => clearTimeout(timer);
  }, [isBusy, visible]);

  if (!visible) return null;

  const isLoading = speech.status === "loading";

  return (
    <View style={[s.speechBar, ts.speechBar, { opacity: fading ? 0 : 1 }]}>
      <View style={s.speechBarIconWrap}>
        {isLoading ? (
          <Ionicons name="hourglass-outline" size={16} color={t.accent} />
        ) : (
          <Ionicons name="volume-high" size={16} color={t.accent} />
        )}
      </View>
      <View style={s.speechBarBody}>
        <Text numberOfLines={1} style={[s.speechBarText, ts.mutedText]}>
          {isLoading ? "Synthesizing speech…" : speech.text}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop playback"
        onPress={speech.stop}
        style={s.speechBarStop}
        hitSlop={8}
      >
        <Ionicons name="close" size={18} color={t.textMuted} />
      </Pressable>
    </View>
  );
}

export const SpeechBar = memo(SpeechBarBase);
