import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { THINKING_EFFORTS, useAppStore } from "@kotys/core";
import type { ModelListing, ThinkEffort } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { Sheet } from "./Sheet";
import { s, themedStyles } from "./styles";

interface IProps {
  model: ModelListing;
  isVisible: boolean;
  onClose: () => void;
}

const THINK_LABELS: Record<ThinkEffort, { label: string; hint: string }> = {
  off: { label: "off", hint: "No reasoning" },
  low: { label: "low", hint: "Quick reasoning" },
  medium: { label: "medium", hint: "Balanced reasoning" },
  high: { label: "high", hint: "Deep reasoning" },
  max: { label: "max", hint: "Maximum reasoning" },
};

export function ThinkingPicker({ model, isVisible, onClose }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const thinkingEffort = useAppStore((st) => st.thinkingEffort);
  const setThinkingEffort = useAppStore((st) => st.setThinkingEffort);

  if (!model.capabilities.includes("thinking")) return null;

  const handleSelect = (effort: ThinkEffort) => {
    setThinkingEffort(effort);
    onClose();
  };

  return (
    <Sheet isVisible={isVisible} onClose={onClose} title="Thinking effort">
      {THINKING_EFFORTS.map((effort) => {
        const isActive = effort === thinkingEffort;
        return (
          <Pressable
            key={effort}
            style={s.row}
            onPress={() => handleSelect(effort)}
          >
            <View style={s.rowBody}>
              <Text style={[s.name, isActive ? ts.accentText : ts.text]}>
                {THINK_LABELS[effort].label}
              </Text>
              <Text style={[s.hint, ts.mutedText]}>
                {THINK_LABELS[effort].hint}
              </Text>
            </View>
            {isActive ? (
              <Ionicons name="checkmark" size={18} color={t.accent} />
            ) : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}
