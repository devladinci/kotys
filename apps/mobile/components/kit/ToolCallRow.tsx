import { Image, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDuration } from "@kotys/core";
import type { ToolActivity } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { humanizeTool, toolTone } from "./toolDisplay";
import { s, themedStyles } from "./styles";

interface IProps {
  call: ToolActivity;
  isStreaming: boolean;
}

const ICON_BG_ALPHA = "22";

export function ToolCallRow({ call, isStreaming }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const tone = toolTone(call, t.accent, t.textMuted);
  const isRunning = call.status === "running" && isStreaming;
  const duration =
    call.durationMs !== undefined ? formatDuration(call.durationMs) : null;

  return (
    <View style={[s.toolRow, ts.toolRow]}>
      <View
        style={[
          s.toolIconWrap,
          { backgroundColor: `${tone.color}${ICON_BG_ALPHA}` },
        ]}
      >
        <View style={isRunning ? s.toolPulse : null}>
          <Ionicons name={tone.icon} size={13} color={tone.color} />
        </View>
      </View>
      <View style={s.rowBody}>
        <View style={s.toolHeader}>
          <Text numberOfLines={1} style={[s.toolLabel, ts.text]}>
            {humanizeTool(call)}
          </Text>
          {call.server ? (
            <Text style={[s.toolServer, ts.toolServer]}>{call.server}</Text>
          ) : null}
          {call.status === "error" ? (
            <Text style={[s.toolFailed, ts.dangerText]}>failed</Text>
          ) : null}
          {duration ? (
            <Text style={[s.toolDuration, ts.mutedText]}>{duration}</Text>
          ) : null}
        </View>
        {call.error ? (
          <Text numberOfLines={2} style={[s.toolError, ts.dangerText]}>
            {call.error}
          </Text>
        ) : null}
        {call.images && call.images.length > 0 ? (
          <View style={s.toolImages}>
            {call.images.map((image) => (
              <Image
                key={image}
                source={{ uri: `data:image/jpeg;base64,${image}` }}
                style={[s.toolImage, ts.toolImage]}
                resizeMode="cover"
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
