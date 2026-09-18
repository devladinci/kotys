import { useState } from "react";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useChatList, useAppStore } from "@kotys/core";
import { theme, useThemeMode } from "../../lib/theme";

/**
 * New chat sits in the middle of the tab bar as a raised accent button —
 * a top-level action kept thumb-reachable (the Telegram/Material "center
 * action" pattern). Implemented as a tabBarButton override (rather than an
 * absolutely-positioned overlay) so it never blocks the other four tabs and
 * stays inside the bar's safe-area padding.
 *
 * The chat is created here and PUSHED onto the root stack, so the chat
 * screen's back button returns to wherever the user was (chats list or
 * another tab). Creating inside the `new` route forced a `replace`, which
 * destroyed the back stack.
 */
function ComposeTabButton({ children }: { children: React.ReactNode }) {
  const mode = useThemeMode();
  const t = theme(mode);
  const { createChat } = useChatList();
  const bumpChatsVersion = useAppStore((st) => st.bumpChatsVersion);
  const [creating, setCreating] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Deliberately ignores the navigator's onPress (which would mount the
  // hidden `new` route): the chat is created here and PUSHED onto the root
  // stack, so the chat screen's back button returns to wherever the user
  // was. The old flow mounted the route and router.replace'd, destroying
  // the back stack.
  const handlePress = () => {
    if (creating) return;
    setCreating(true);
    void createChat()
      .then((id) => {
        bumpChatsVersion();
        if (id) router.push(`/chat/${id}`);
      })
      .finally(() => setCreating(false));
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New chat"
      onPress={handlePress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      style={s.compose}
    >
      <View
        pointerEvents="none"
        style={[
          s.composeHit,
          { backgroundColor: isPressed ? t.accentHover : t.accent },
        ]}
      >
        {creating ? (
          <ActivityIndicator size="small" color={t.accentInk} />
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const mode = useThemeMode();
  const t = theme(mode);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: "700", fontSize: 17 },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
        },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pomodoro"
        options={{
          title: "Timer",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="timer" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="new"
        options={{
          title: "",
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <Ionicons name="add" size={26} color={t.accentInk} />
          ),
          tabBarButton: (props) => <ComposeTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="todos"
        options={{
          title: "Todos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  // The Pressable fills the tab slot so the circle is dead-centered in the
  // bar's middle cell; the visible circle is drawn by the inner view.
  compose: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  composeHit: {
    top: -14,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
