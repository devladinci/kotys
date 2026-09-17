import { useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fmtTokens } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { Sheet } from "./Sheet";
import { ON_ACCENT, s, themedStyles } from "./styles";

interface IProps {
  used: number;
  pct: number;
  ctx: number;
  isCompacted?: boolean;
  isCompacting?: boolean;
  onCompact?: () => void;
}

const FULL_PCT = 90;
const HIGH_PCT = 75;
const FULL_COLOR = "#ef4444";
const HIGH_COLOR = "#f59e0b";
const BUSY_OPACITY = 0.6;

const usageColor = (pct: number, accent: string) => {
  if (pct >= FULL_PCT) return FULL_COLOR;
  if (pct >= HIGH_PCT) return HIGH_COLOR;
  return accent;
};

export function TokenBadge({
  used,
  pct,
  ctx,
  isCompacted,
  isCompacting,
  onCompact,
}: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  if (used <= 0 || ctx <= 0) return null;

  const color = usageColor(pct, t.accent);

  const handleOpen = () => setIsSheetOpen(true);

  const handleClose = () => setIsSheetOpen(false);

  const handleCompact = () => {
    onCompact?.();
    setIsSheetOpen(false);
  };

  return (
    <>
      <Pressable onPress={handleOpen} hitSlop={8} style={s.badge}>
        <Ionicons name="pie-chart" size={13} color={color} />
        <Text style={[s.badgePct, { color }]}>{pct}%</Text>
      </Pressable>
      <Sheet
        isVisible={isSheetOpen}
        onClose={handleClose}
        title="Context usage"
      >
        <Text style={[s.usage, { color }]}>
          {pct}% · {fmtTokens(used)} of {fmtTokens(ctx)}
        </Text>
        {isCompacted ? (
          <Text style={[s.usageNote, ts.mutedText]}>Context compacted</Text>
        ) : null}
        <Text style={[s.usageNote, ts.mutedText]}>
          When the context fills, older messages are summarized automatically to
          keep the conversation going.
        </Text>
        {onCompact ? (
          <Pressable
            disabled={isCompacting}
            onPress={handleCompact}
            style={[
              s.compact,
              ts.compact,
              { opacity: isCompacting ? BUSY_OPACITY : 1 },
            ]}
          >
            {isCompacting ? (
              <ActivityIndicator color={ON_ACCENT} size="small" />
            ) : (
              <Text style={s.compactLabel}>Compact now</Text>
            )}
          </Pressable>
        ) : null}
      </Sheet>
    </>
  );
}
