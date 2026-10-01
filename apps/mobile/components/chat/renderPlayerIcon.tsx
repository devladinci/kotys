import { Ionicons } from "@expo/vector-icons";
import type {
  PlayerIconName,
  PlayerIconRenderer,
} from "@saystack/react-native";

const ICONS: Record<PlayerIconName, keyof typeof Ionicons.glyphMap> = {
  play: "play",
  pause: "pause",
  replay: "refresh",
  previous: "play-skip-back",
  next: "play-skip-forward",
  close: "close",
};

export const renderPlayerIcon: PlayerIconRenderer = (name, color, size) => (
  <Ionicons name={ICONS[name]} size={size} color={color} />
);
