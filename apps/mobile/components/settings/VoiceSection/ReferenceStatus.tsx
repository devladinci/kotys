import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useRpc } from "@kotys/core";
import { useThemeMode } from "../../../lib/theme";
import { s, themedStyles } from "./styles";

export function ReferenceStatus() {
  const rpc = useRpc();
  const ts = themedStyles[useThemeMode()];
  const [isSet, setIsSet] = useState<boolean | null>(null);

  useEffect(() => {
    let isCancelled = false;
    rpc.tts.reference().then(
      (status) => {
        if (!isCancelled) setIsSet(status.isSet);
      },
      () => undefined,
    );

    return () => {
      isCancelled = true;
    };
  }, [rpc]);

  if (isSet === null) return null;

  return (
    <Text style={[s.hint, ts.mutedText]}>
      {isSet
        ? "Replies are read in the voice of your reference clip."
        : "No reference voice yet, so the voice can change between sentences. Add one in Settings → Voice on your computer."}
    </Text>
  );
}
