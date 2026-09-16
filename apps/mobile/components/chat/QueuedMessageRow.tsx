import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { QUEUE_LABELS, steerStateOf } from "@kotys/core";
import type { QueuedMessage } from "@kotys/core";
import { theme, useThemeMode } from "../../lib/theme";
import { s, themedStyles } from "./styles";

interface IProps {
  message: QueuedMessage;
  streamingId: number | null;
  onDequeue: (id: number) => void;
  onSteer: (id: number) => void;
}

export function QueuedMessageRow({
  message,
  streamingId,
  onDequeue,
  onSteer,
}: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const steerState = steerStateOf(message, streamingId);

  const handleSteer = () => onSteer(message.id);

  const handleDequeue = () => onDequeue(message.id);

  return (
    <View style={[s.queueRow, ts.queueRow]}>
      <Text numberOfLines={1} style={[s.queueText, ts.mutedText]}>
        {message.text || QUEUE_LABELS.images}
      </Text>
      {/* Offered to the reply: it can no longer be taken back. */}
      {steerState === "injecting" ? (
        <View
          style={s.injecting}
          accessibilityLabel="Injecting into the running reply"
        >
          <ActivityIndicator size="small" color={t.textMuted} />
          <Text style={[s.queueCaption, ts.mutedText]}>
            {QUEUE_LABELS.injecting}
          </Text>
        </View>
      ) : (
        <>
          {steerState === "ready" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={QUEUE_LABELS.inject}
              onPress={handleSteer}
              hitSlop={8}
            >
              <Ionicons
                name="return-down-forward"
                size={14}
                color={t.textMuted}
              />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={QUEUE_LABELS.remove}
            onPress={handleDequeue}
            hitSlop={8}
          >
            <Ionicons name="close" size={14} color={t.textMuted} />
          </Pressable>
        </>
      )}
    </View>
  );
}
