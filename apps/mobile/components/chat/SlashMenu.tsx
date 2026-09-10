import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { SkillListing } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";

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
    (s) =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
};

function SlashMenuBase({ skills, query, onPick, onDismiss }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const rows = filterSkills(skills, query);

  if (rows.length === 0) return null;

  return (
    <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
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
              <Text style={[s.name, { color: t.text }]}>
                /{skill.name}
                {skill.argumentHint ? (
                  <Text style={[s.hint, { color: t.textMuted }]}>
                    {" "}
                    {skill.argumentHint}
                  </Text>
                ) : null}
              </Text>
              <Text style={[s.desc, { color: t.textMuted }]} numberOfLines={2}>
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

const SlashMenu = memo(SlashMenuBase);
export default SlashMenu;

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