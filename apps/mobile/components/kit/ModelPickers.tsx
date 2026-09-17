import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore, useModels } from "@kotys/core";
import type { ModelListing } from "@kotys/contracts";
import { theme, useThemeMode } from "../../lib/theme";
import { CapabilityIcons } from "./CapabilityIcons";
import { Sheet } from "./Sheet";
import { s, themedStyles } from "./styles";

interface IProps {
  chatModel: ModelListing;
  onSelectModel: (model: ModelListing) => void | Promise<void>;
  isVisible: boolean;
  onClose: () => void;
}

const providerOf = (model: ModelListing) => model.provider ?? "ollama";

const modelKey = (model: ModelListing) =>
  `${providerOf(model)}:${model.name}:${model.source}`;

export function ModelPickers({
  chatModel,
  onSelectModel,
  isVisible,
  onClose,
}: IProps) {
  const models = useModels();
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const defaultModel = useAppStore((st) => st.defaultModel);
  const setDefaultModel = useAppStore((st) => st.setDefaultModel);
  const [query, setQuery] = useState("");

  const filtered = models.filter((model) =>
    model.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handlePick = async (model: ModelListing) => {
    setDefaultModel(model);
    await onSelectModel(model);
    onClose();
  };

  const handleClearQuery = () => setQuery("");

  return (
    <Sheet isVisible={isVisible} onClose={onClose} title="Model">
      <View style={[s.search, ts.search]}>
        <Ionicons name="search" size={15} color={t.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search models…"
          placeholderTextColor={t.textMuted}
          style={[s.searchInput, ts.text]}
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={handleClearQuery} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={t.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView style={s.modelList}>
        {filtered.map((model) => {
          const isActive =
            model.name === chatModel.name &&
            providerOf(model) === providerOf(chatModel);
          return (
            <Pressable
              key={modelKey(model)}
              style={[s.row, isActive ? ts.rowActive : null]}
              onPress={() => void handlePick(model)}
            >
              <View style={s.rowBody}>
                <View style={s.nameRow}>
                  <Text
                    numberOfLines={1}
                    style={[s.name, isActive ? ts.accentText : ts.text]}
                  >
                    {model.name}
                  </Text>
                  {model.name === defaultModel.name ? (
                    <Text style={[s.defaultTag, ts.mutedText]}>default</Text>
                  ) : null}
                </View>
                <Text style={[s.provider, ts.mutedText]}>
                  provider: {providerOf(model)}
                </Text>
                <CapabilityIcons model={model} color={t.textMuted} />
              </View>
              {isActive ? (
                <Ionicons name="checkmark" size={18} color={t.accent} />
              ) : null}
            </Pressable>
          );
        })}
        {filtered.length === 0 ? (
          <Text style={[s.empty, ts.mutedText]}>
            {models.length === 0
              ? "No models available"
              : `No models match "${query}"`}
          </Text>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
