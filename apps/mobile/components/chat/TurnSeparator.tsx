import { View } from "react-native";
import type { Message } from "@kotys/core";
import { s } from "./styles";

interface IProps {
  trailingItem?: Message;
}

export function TurnSeparator({ trailingItem }: IProps) {
  return (
    <View style={trailingItem?.role === "user" ? s.turnGap : s.messageGap} />
  );
}
