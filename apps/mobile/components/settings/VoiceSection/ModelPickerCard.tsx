import { useState } from "react";
import type { ReactNode } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { ListRenderItemInfo } from "react-native";
import type { ModelListing } from "@kotys/contracts";
import type { IModelOption } from "@kotys/core";
import { useThemeMode } from "../../../lib/theme";
import { Sheet } from "../../kit/Sheet";
import { s, themedStyles } from "./styles";

interface IPickerOption {
  key: string | null;
  label: string;
}

interface IProps {
  title: string;
  description: string;
  emptyText: string;
  models: ModelListing[] | null;
  loadError: string | null;
  selected: IModelOption | null;
  optionOf: (model: ModelListing) => IModelOption;
  onChange: (key: string | null) => void;
  children?: ReactNode;
}

const optionKey = (option: IPickerOption) => option.key ?? "none";

export function ModelPickerCard({
  title,
  description,
  emptyText,
  models,
  loadError,
  selected,
  optionOf,
  onChange,
  children,
}: IProps) {
  const ts = themedStyles[useThemeMode()];
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const list = (models ?? []).map(optionOf);
  const selectedKey = selected?.key ?? null;
  const selectedLabel = selected?.label ?? "None";
  const isLoading = !models && !loadError;
  const isEmpty = list.length === 0 && !selected;
  const isUnavailable =
    selected !== null && !list.some((o) => o.key === selected.key);
  const options: IPickerOption[] = [
    { key: null, label: "None" },
    ...(isUnavailable
      ? [{ key: selected.key, label: `${selected.label} (unavailable)` }]
      : []),
    ...list,
  ];

  const handleOpen = () => setIsPickerOpen(true);

  const handleClose = () => setIsPickerOpen(false);

  const handlePick = (key: string | null) => {
    setIsPickerOpen(false);
    onChange(key);
  };

  const renderOption = ({ item }: ListRenderItemInfo<IPickerOption>) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => handlePick(item.key)}
      style={[s.rowCard, ts.rowCard]}
    >
      <Text
        style={[
          s.rowText,
          item.key === selectedKey ? ts.selectedText : ts.text,
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
            accessibilityLabel={`${title}: ${selectedLabel}`}
            onPress={handleOpen}
            style={[s.input, ts.input]}
          >
            <Text style={[s.inputText, selected ? ts.text : ts.mutedText]}>
              {selectedLabel}
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
