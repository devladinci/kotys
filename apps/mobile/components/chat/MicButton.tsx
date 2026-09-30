import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IHoldToTalk } from "@saystack/react-native";
import { theme, useThemeMode } from "../../lib/theme";
import { ON_ACCENT, s, themedStyles } from "./styles";

interface IProps {
  hold: IHoldToTalk;
  isBusy: boolean;
}

export function MicButton({ hold, isBusy }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const hotStyle = hold.isCancelling ? ts.micCancel : ts.micHot;
  const iconColor = hold.isHolding
    ? ON_ACCENT
    : isBusy
      ? t.accent
      : t.textMuted;

  return (
    <View
      {...hold.handlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Hold to dictate"
      style={[s.toolBtn, hold.isHolding ? [s.micHot, hotStyle] : null]}
    >
      <Ionicons
        name={isBusy ? "hourglass-outline" : "mic-outline"}
        size={19}
        color={iconColor}
      />
    </View>
  );
}
