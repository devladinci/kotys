import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PERMISSION_MODES, useAppStore } from "@kotys/core";
import type { PermissionMode } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { Sheet } from "./Sheet";
import { s, themedStyles } from "./styles";

interface IProps {
  isVisible: boolean;
  onClose: () => void;
}

const AUTOPILOT_COLOR = "#10b981";

const MODE_ICONS: Record<PermissionMode, keyof typeof Ionicons.glyphMap> = {
  ask: "help-circle-outline",
  copilot: "airplane-outline",
  autopilot: "rocket-outline",
};

const MODE_LABELS: Record<PermissionMode, { label: string; hint: string }> = {
  ask: { label: "ask", hint: "Confirm every tool use" },
  copilot: { label: "copilot", hint: "Reads freely, asks before writes" },
  autopilot: { label: "autopilot", hint: "Reads and writes without asking" },
};

const iconColor = (
  permissionMode: PermissionMode,
  accent: string,
  muted: string,
) => {
  if (permissionMode === "autopilot") return AUTOPILOT_COLOR;
  if (permissionMode === "copilot") return accent;
  return muted;
};

export function ModePicker({ isVisible, onClose }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const permissionMode = useAppStore((st) => st.permissionMode);
  const setPermissionMode = useAppStore((st) => st.setPermissionMode);

  const handleSelect = (next: PermissionMode) => {
    setPermissionMode(next);
    onClose();
  };

  return (
    <Sheet isVisible={isVisible} onClose={onClose} title="Permission mode">
      {PERMISSION_MODES.map((item) => {
        const isActive = item === permissionMode;
        return (
          <Pressable
            key={item}
            style={s.row}
            onPress={() => handleSelect(item)}
          >
            <Ionicons
              name={MODE_ICONS[item]}
              size={16}
              color={iconColor(item, t.accent, t.textMuted)}
            />
            <View style={s.rowBodyWithIcon}>
              <Text style={[s.name, isActive ? ts.accentText : ts.text]}>
                {MODE_LABELS[item].label}
              </Text>
              <Text style={[s.hint, ts.mutedText]}>
                {MODE_LABELS[item].hint}
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
