import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ModelListing } from "@kotys/contracts";
import { s } from "./styles";

interface IProps {
  model: ModelListing;
  color: string;
}

const LOCAL_BADGE_OPACITY = 1;
const REMOTE_BADGE_OPACITY = 0.6;

const sourceLabel = (model: ModelListing) => {
  if ((model.provider ?? "ollama") === "omlx") return "OMLX";
  return model.source === "local" ? "LOCAL" : "CLOUD";
};

export function CapabilityIcons({ model, color }: IProps) {
  return (
    <View style={s.capabilities}>
      {model.capabilities.includes("vision") ? (
        <Ionicons name="eye-outline" size={13} color={color} />
      ) : null}
      {model.capabilities.includes("tools") ? (
        <Ionicons name="construct-outline" size={13} color={color} />
      ) : null}
      {model.capabilities.includes("thinking") ? (
        <Ionicons name="sparkles-outline" size={13} color={color} />
      ) : null}
      <Text
        style={[
          s.sourceBadge,
          {
            color,
            borderColor: color,
            opacity:
              model.source === "local"
                ? LOCAL_BADGE_OPACITY
                : REMOTE_BADGE_OPACITY,
          },
        ]}
      >
        {sourceLabel(model)}
      </Text>
    </View>
  );
}
