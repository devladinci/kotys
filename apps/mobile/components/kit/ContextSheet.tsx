import { useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { fmtTokens } from "@kotys/contracts";
import type { CompactResult } from "@kotys/core";
import { useThemeMode } from "../../lib/theme";
import { Sheet } from "./Sheet";
import { ON_ACCENT, s, themedStyles, usageTones } from "./styles";
import { usageLevel } from "./usageLevel";

interface IProps {
  isVisible: boolean;
  onClose: () => void;
  used: number;
  pct: number;
  ctx: number;
  isCompacted?: boolean;
  isCompacting?: boolean;
  onCompact: () => Promise<CompactResult>;
}

type Notice = Exclude<CompactResult, "compacted">;

const NOTICES: Record<Notice, string> = {
  nothing: "Nothing to compact yet — the conversation is still short.",
  error: "Could not compact. Check that the model is reachable and try again.",
};

export function ContextSheet({
  isVisible,
  onClose,
  used,
  pct,
  ctx,
  isCompacted,
  isCompacting,
  onCompact,
}: IProps) {
  const mode = useThemeMode();
  const ts = themedStyles[mode];
  const tone = usageTones[mode][usageLevel(pct)];
  const [notice, setNotice] = useState<Notice | null>(null);

  const handleClose = () => {
    setNotice(null);
    onClose();
  };

  const handleResult = (result: CompactResult) => {
    if (result === "compacted") handleClose();
    else setNotice(result);
  };

  const handleCompact = () => {
    setNotice(null);
    void onCompact().then(handleResult);
  };

  return (
    <Sheet isVisible={isVisible} onClose={handleClose} title="Context usage">
      <Text style={[s.usage, tone.text]}>
        {pct}% · {fmtTokens(used)} of {fmtTokens(ctx)}
      </Text>
      {isCompacted ? (
        <Text style={[s.usageNote, ts.mutedText]}>Context compacted</Text>
      ) : null}
      <Text style={[s.usageNote, ts.mutedText]}>
        When the context fills, older messages are summarized automatically to
        keep the conversation going.
      </Text>
      {notice ? (
        <Text style={[s.usageNote, ts.text]}>{NOTICES[notice]}</Text>
      ) : null}
      <Pressable
        disabled={isCompacting}
        onPress={handleCompact}
        style={[s.compact, ts.compact, isCompacting && s.compactBusy]}
      >
        {isCompacting ? (
          <ActivityIndicator color={ON_ACCENT} size="small" />
        ) : (
          <Text style={s.compactLabel}>Compact now</Text>
        )}
      </Pressable>
    </Sheet>
  );
}
