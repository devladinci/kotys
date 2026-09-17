import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme, useThemeMode } from "../../lib/theme";
import { s, themedStyles } from "./styles";

interface IProps {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const APPEAR_MS = 240;
const MIN_BOTTOM_INSET = 12;

function useBottomSpace(): number {
  try {
    return useSafeAreaInsets().bottom;
  } catch {
    return 20;
  }
}

export function Sheet({ isVisible, onClose, title, children }: IProps) {
  const mode = useThemeMode();
  const t = theme(mode);
  const ts = themedStyles[mode];
  const inset = useBottomSpace();
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!isVisible) return;
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: APPEAR_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isVisible, appear]);

  if (!isVisible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={s.sheetContainer}>
        <Animated.View style={[s.sheetBackdrop, { opacity: appear }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            s.sheet,
            ts.sheet,
            {
              paddingBottom: Math.max(inset, MIN_BOTTOM_INSET),
              transform: [
                {
                  translateY: appear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [400, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={s.grabber}>
            <View style={[s.grabberBar, ts.grabberBar]} />
          </View>
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, ts.text]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={t.textMuted} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
