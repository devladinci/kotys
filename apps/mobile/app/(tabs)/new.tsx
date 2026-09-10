import { useEffect } from "react";
import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { theme, useThemeMode } from "../../lib/theme";

/**
 * Fallback for the hidden `new` tab route. Chat creation now happens inside
 * the tab-bar compose button (a push keeps the back stack intact); this
 * screen only mounts if something navigates here directly — it just sends
 * the user home instead of creating a duplicate chat.
 */
export default function NewChatAction() {
  const mode = useThemeMode();
  const t = theme(mode);

  useEffect(() => {
    router.replace("/");
  }, []);

  return (
    <View style={[s.center, { backgroundColor: t.bg }]}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
