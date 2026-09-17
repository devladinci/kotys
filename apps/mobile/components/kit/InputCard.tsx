import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { InputField, InputWidget } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { s, themedStyles } from "./styles";

interface IProps {
  widget: InputWidget;
}

const answerLabel = (field: InputField, value: string) => {
  if (field.kind !== "choice") return value;
  return field.options.find((option) => option.value === value)?.label ?? value;
};

export function InputCard({ widget }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];

  return (
    <View style={[s.inputCard, ts.inputCard]}>
      <View style={s.inputCardRow}>
        <Ionicons
          name="help-circle-outline"
          size={14}
          color={t.accent}
          style={s.inputCardIcon}
        />
        <View style={s.inputCardBody}>
          <Text style={[s.inputCardTitle, ts.text]}>{widget.title}</Text>
          {widget.description ? (
            <Text style={[s.inputCardDescription, ts.mutedText]}>
              {widget.description}
            </Text>
          ) : null}
          {widget.fields.map((field) => {
            const value = widget.answers?.[field.id];
            return (
              <View key={field.id} style={s.inputField}>
                <Text style={[s.inputFieldLabel, ts.mutedText]}>
                  {field.label ?? field.id}
                </Text>
                <Text
                  style={[
                    s.inputFieldValue,
                    value ? ts.text : ts.mutedText,
                    value ? null : s.inputFieldMissing,
                  ]}
                >
                  {value ? answerLabel(field, value) : "No answer"}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
