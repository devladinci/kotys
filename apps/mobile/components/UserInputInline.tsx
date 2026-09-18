/**
 * Inline form that takes the composer's place while an input request is
 * pending — the mobile twin of ui-web's UserInputComposer. The chat screen
 * renders it instead of the composer; the user's draft survives untouched.
 */
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUserInput } from "@kotys/core";
import { theme, useThemeMode } from "../lib/theme";

export function UserInputInline() {
  const { pending, submit, cancel } = useUserInput();
  const mode = useThemeMode();
  const t = theme(mode);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const setAnswer = useCallback(
    (id: string, value: string) => setDraft((d) => ({ ...d, [id]: value })),
    [],
  );

  if (!pending) return null;

  const missing = pending.fields.some((f) => {
    const required = f.required !== false;
    return required && !(draft[f.id] ?? "").trim();
  });

  return (
    <View
      style={[s.card, { backgroundColor: t.surface, borderColor: t.accent }]}
    >
      <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>
        {pending.title}
      </Text>
      {pending.description ? (
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          {pending.description}
        </Text>
      ) : null}

      {pending.fields.map((field) => (
        <View key={field.id} style={s.field}>
          {field.kind === "choice" ? (
            field.options.map((opt) => {
              const selected = draft[field.id] === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  onPress={() => setAnswer(field.id, opt.value)}
                  style={[
                    s.option,
                    {
                      backgroundColor: selected ? t.accent : t.surface2,
                      borderColor: t.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? t.accentInk : t.text,
                      fontSize: 14,
                      fontWeight: selected ? "700" : "500",
                    }}
                  >
                    {opt.label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={16} color={t.accentInk} />
                  ) : null}
                </Pressable>
              );
            })
          ) : (
            <TextInput
              value={draft[field.id] ?? ""}
              onChangeText={(v) => setAnswer(field.id, v)}
              placeholder={field.placeholder ?? field.label}
              placeholderTextColor={t.textMuted}
              multiline={field.multiline}
              keyboardAppearance={mode === "dark" ? "dark" : "light"}
              style={[
                s.textInput,
                field.multiline && s.textInputMultiline,
                {
                  backgroundColor: t.surface2,
                  borderColor: t.border,
                  color: t.text,
                },
              ]}
            />
          )}
        </View>
      ))}

      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={cancel}
          style={[s.button, { backgroundColor: t.surface2 }]}
        >
          <Text style={{ color: t.text, fontWeight: "600" }}>
            {pending.cancelLabel ?? "Cancel"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={missing}
          onPress={() => submit(draft)}
          style={[
            s.button,
            { backgroundColor: t.accent, opacity: missing ? 0.4 : 1 },
          ]}
        >
          <Text style={{ color: t.accentInk, fontWeight: "600" }}>
            {pending.submitLabel ?? "Submit"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    marginHorizontal: 10,
  },
  field: { gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textInputMultiline: { minHeight: 90, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
});
