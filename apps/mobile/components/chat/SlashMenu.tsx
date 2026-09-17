import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SkillListing } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { themedStyles } from "./styles";

interface IProps {
  skills: SkillListing[];
  query: string;
  onPick: (skill: SkillListing) => void;
  onDismiss: () => void;
}

const filterSkills = (skills: SkillListing[], query: string) => {
  if (!query) return skills;
  const q = query.toLowerCase();
  return skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q),
  );
};

function SlashMenuBase({ skills, query, onPick, onDismiss }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const rows = filterSkills(skills, query);

  if (rows.length === 0) return null;

  return (
    <View style={[s.card, ts.slashMenu]}>
      <ScrollView keyboardShouldPersistTaps="handled" style={s.list}>
        {rows.map((skill) => (
          <Pressable
            key={skill.name}
            accessibilityRole="button"
            accessibilityLabel={`Use skill ${skill.name}`}
            onPress={() => onPick(skill)}
            style={s.row}
          >
            <Ionicons name="flash" size={13} color={t.accent} />
            <View style={s.textWrap}>
              <Text style={[s.name, ts.text]}>
                /{skill.name}
                {skill.argumentHint ? (
                  <Text style={[s.hint, ts.mutedText]}>
                    {" "}
                    {skill.argumentHint}
                  </Text>
                ) : null}
              </Text>
              <Text style={[s.desc, ts.mutedText]} numberOfLines={2}>
                {skill.description}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss skill suggestions"
        onPress={onDismiss}
        style={s.dismiss}
        hitSlop={8}
      >
        <Ionicons name="close" size={14} color={t.textMuted} />
      </Pressable>
    </View>
  );
}

export const SlashMenu = memo(SlashMenuBase);

const s = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    marginBottom: 4,
    maxHeight: 220,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textWrap: { flex: 1, gap: 2 },
  name: { fontSize: 13, fontWeight: "600", fontFamily: "Menlo" },
  hint: { fontSize: 12, fontWeight: "400", fontFamily: "System" },
  desc: { fontSize: 11, lineHeight: 15 },
  dismiss: { position: "absolute", top: 6, right: 8 },
});
