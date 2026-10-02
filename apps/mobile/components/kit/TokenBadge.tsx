import { ActivityIndicator, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeMode } from "../../lib/theme";
import { s, usageTones } from "./styles";
import { usageLevel } from "./usageLevel";

interface IProps {
  pct: number;
  isCompacting?: boolean;
  onPress: () => void;
}

export function TokenBadge({ pct, isCompacting, onPress }: IProps) {
  const tone = usageTones[useThemeMode()][usageLevel(pct)];

  return (
    <Pressable onPress={onPress} hitSlop={8} style={s.badge}>
      {isCompacting ? (
        <ActivityIndicator color={tone.color} size="small" />
      ) : (
        <Ionicons name="pie-chart" size={13} color={tone.color} />
      )}
      <Text style={[s.badgePct, tone.text]}>{pct}%</Text>
    </Pressable>
  );
}
