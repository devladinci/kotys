import { useState } from "react";
import type { ReactNode } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { ListRenderItemInfo } from "react-native";
import type { ModelListing } from "@kotys/contracts";
import { modelRefName, modelRefSetting } from "@kotys/core";
import { useThemeMode } from "../../../lib/theme";
import { Sheet } from "../../kit/Sheet";
import { s, themedStyles } from "./styles";

interface IPickerOption {
  name: string | null;
  label: string;
}

interface IProps {
  title: string;
  description: string;
  emptyText: string;
  models: ModelListing[] | null;
  loadError: string | null;
  selected: string | null;
  onChange: (setting: string | null) => void;
  children?: ReactNode;
}

const optionKey = (option: IPickerOption) => option.name ?? "none";

export function ModelPickerCard({
  title,
  description,
  emptyText,
  models,
  loadError,
  selected,
  onChange,
  children,
}: IProps) {
  const ts = themedStyles[useThemeMode()];
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const selectedName = modelRefName(selected);
  const list = models ?? [];
  const isLoading = !models && !loadError;
  const isEmpty = list.length === 0 && !selectedName;
  const isUnavailable =
    selectedName !== null && !list.some((m) => m.name === selectedName);
  const options: IPickerOption[] = [
    { name: null, label: "None" },
    ...(isUnavailable
      ? [{ name: selectedName, label: `${selectedName} (unavailable)` }]
      : []),
    ...list.map((m) => ({ name: m.name, label: m.name })),
  ];

  const handleOpen = () => setIsPickerOpen(true);

  const handleClose = () => setIsPickerOpen(false);

  const handlePick = (name: string | null) => {
    setIsPickerOpen(false);
    if (!name) {
      onChange(null);
      return;
    }
    const listing = list.find((m) => m.name === name);
    onChange(modelRefSetting(listing?.provider ?? "omlx", name));
  };

  const renderOption = ({ item }: ListRenderItemInfo<IPickerOption>) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => handlePick(item.name)}
      style={[s.rowCard, ts.rowCard]}
    >
      <Text
        style={[
          s.rowText,
          item.name === selectedName ? ts.selectedText : ts.text,
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );

  return (
    <View>
      <View style={[s.card, ts.card]}>
        <Text style={[s.cardTitle, ts.text]}>{title}</Text>
        <Text style={[s.hint, ts.mutedText]}>{description}</Text>
        {isLoading ? (
          <Text style={[s.hint, ts.mutedText]}>Loading…</Text>
        ) : isEmpty ? (
          <Text style={[s.hint, loadError ? ts.dangerText : ts.mutedText]}>
            {loadError ?? emptyText}
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}: ${selectedName ?? "None"}`}
            onPress={handleOpen}
            style={[s.input, ts.input]}
          >
            <Text style={[s.inputText, selectedName ? ts.text : ts.mutedText]}>
              {selectedName ?? "None"}
            </Text>
          </Pressable>
        )}
        {children}
      </View>
      <Sheet isVisible={isPickerOpen} onClose={handleClose} title={title}>
        <FlatList
          data={options}
          keyExtractor={optionKey}
          renderItem={renderOption}
        />
      </Sheet>
    </View>
  );
}
