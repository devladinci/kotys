import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  KotysProvider,
  isUnauthorizedError,
  subscribeChatSync,
  subscribePomodoro,
  subscribeTodoChanges,
  subscribeToolApprovals,
  subscribeUserInput,
  useAppStore,
  usePomodoroStore,
  useSocket,
  useTodoStore,
} from "@kotys/core";
import { mobilePlatform } from "../lib/platform";
import { clearConfig, loadConfig, saveConfig } from "../lib/config";
import { useAppStateSocket } from "../lib/useAppStateSocket";
import { PairingScreen } from "../components/PairingScreen";
import { ApprovalSheet } from "../components/ApprovalSheet";
import { theme, useThemeMode } from "../lib/theme";

// Show banners (rather than heads-up popups) while the app is foregrounded;
// scheduled reminders still fire through the OS when backgrounded.
void Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Wires socket subscriptions and hydrates every store from the daemon.
 * On RPC failure, renders a recoverable screen — Retry or Pair again —
 * instead of leaving the raw "Network request failed" to surface nowhere.
 */
function Bootstrap({ onUnpair }: { onUnpair: () => void }) {
  useAppStateSocket();
  const mode = useThemeMode();
  const t = theme(mode);
  const [status, setStatus] = useState<"connecting" | "online" | "unreachable">(
    "connecting",
  );
  const socket = useSocket();

  const hydrate = useCallback(async () => {
    try {
      // Prove the RPC path works before wiring the app.
      await useAppStore.getState().hydrate();
      await useTodoStore.getState().hydrateSidebar();
      await useTodoStore.getState().loadTodos();
      await usePomodoroStore.getState().hydrate();
      setStatus("online");
      socket.wake();
    } catch (error) {
      // A rejected token can never recover by retrying — pair again.
      if (isUnauthorizedError(error)) {
        clearConfig()
          .catch(() => undefined)
          .finally(onUnpair);
        return;
      }
      setStatus("unreachable");
    }
  }, [socket, onUnpair]);

  useEffect(() => {
    subscribeTodoChanges();
    subscribePomodoro();
    subscribeToolApprovals();
    subscribeUserInput();
    // Live chat list from other clients; deferred hydrate keeps setState
    // out of the effect body.
    subscribeChatSync();
    void Promise.resolve().then(() => void hydrate());
  }, [hydrate]);

  if (status !== "unreachable") return null;
  return (
    <View style={[s.center, s.overlay, { backgroundColor: t.bg }]}>
      <Ionicons name="cloud-offline-outline" size={40} color={t.textMuted} />
      <Text style={[s.errTitle, { color: t.text }]}>
        Can't reach the daemon
      </Text>
      <Text style={[s.errHint, { color: t.textMuted }]}>
        Check that the Mac app is running and the phone is on the same Tailnet
        or Wi-Fi, then retry.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void hydrate()}
        style={[s.btn, { backgroundColor: t.accent }]}
      >
        <Text style={[s.btnText, { color: t.accentInk }]}>Retry</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          clearConfig()
            .catch(() => undefined)
            .finally(onUnpair);
        }}
        style={[s.btn, { borderWidth: 1, borderColor: t.border }]}
      >
        <Text style={[s.btnText, { color: t.text }]}>Pair again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [config, setConfig] = useState<{
    baseUrl: string;
    token: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mode = useThemeMode();
  const t = theme(mode);

  useEffect(() => {
    void loadConfig()
      .then(setConfig)
      .finally(() => setLoaded(true));
  }, []);

  const pair = useCallback((baseUrl: string, token: string) => {
    void saveConfig(baseUrl, token);
    setConfig({ baseUrl, token });
  }, []);

  const unpair = useCallback(() => setConfig(null), []);

  if (!loaded) {
    return (
      <View style={[s.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // Unpaired: the pairing form replaces the whole router, so no screen can
  // mount and call core hooks without a provider underneath.
  if (!config) {
    return (
      <SafeAreaProvider>
        <PairingScreen onPaired={pair} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <KotysProvider config={config} platform={mobilePlatform}>
        <Bootstrap onUnpair={unpair} />
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="chat/[id]"
              options={{
                headerShown: true,
                headerBackButtonDisplayMode: "minimal",
                headerStyle: { backgroundColor: t.surface },
                headerTintColor: t.text,
                headerTitleStyle: { fontWeight: "600" },
              }}
            />
          </Stack>
        </View>
        {/* Mounted once, over everything: an approval sheet can appear on any
            screen the user happens to be on. Input requests are inline on the
            chat screen, not global. */}
        <ApprovalSheet />
      </KotysProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overlay: { gap: 10, padding: 28 },
  errTitle: { fontSize: 19, fontWeight: "600", marginTop: 12 },
  errHint: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 8,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 28,
    marginTop: 8,
    minWidth: 180,
    alignItems: "center",
  },
  btnText: { fontSize: 15, fontWeight: "600" },
});
