import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDuration } from "@kotys/core";
import type { ToolActivity } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { ToolCallRow } from "./ToolCallRow";
import { s, themedStyles } from "./styles";

interface IProps {
  calls: ToolActivity[];
  isStreaming: boolean;
}

const callKey = (call: ToolActivity) =>
  `${call.tool}:${call.startedAt ?? ""}:${call.textOffset ?? ""}`;

export function ToolTimeline({ calls, isStreaming }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const [isExpanded, setIsExpanded] = useState(false);
  const rows = calls.filter(Boolean);

  if (rows.length === 0) return null;

  const done = rows.filter((call) => call.status !== "running").length;
  const totalMs = rows.reduce((acc, call) => acc + (call.durationMs ?? 0), 0);
  const label = isStreaming
    ? `Using tools… ${rows.length}`
    : `${rows.length} tool${rows.length === 1 ? "" : "s"} · ${formatDuration(totalMs)} in tools`;

  const handleToggle = () => setIsExpanded((expanded) => !expanded);

  return (
    <View>
      <Pressable onPress={handleToggle} style={s.toolStrip} hitSlop={4}>
        <Ionicons name="hammer-outline" size={12} color={t.textMuted} />
        <Text style={[s.toolStripLabel, ts.mutedText]}>{label}</Text>
        {done < rows.length || isStreaming ? (
          <ActivityIndicator size="small" color={t.textMuted} />
        ) : null}
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={t.textMuted}
        />
      </Pressable>
      {isExpanded ? (
        <View style={s.toolList}>
          {rows.map((call) => (
            <ToolCallRow
              key={callKey(call)}
              call={call}
              isStreaming={isStreaming}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
