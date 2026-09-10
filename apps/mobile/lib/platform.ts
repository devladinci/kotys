import { Appearance, AppState } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Notifications from "expo-notifications";
import { SchedulableTriggerInputTypes } from "expo-notifications/build/Notifications.types";
import type { Platform } from "@kotys/core";
import { startVoiceRecording, stopVoiceRecording } from "./voiceRecorder";

/** Set by the message list so scrollToMessage can reach it. */
let scrollHandler: ((messageId: number) => void) | null = null;
export function registerScrollHandler(fn: ((id: number) => void) | null) {
  scrollHandler = fn;
}

export const mobilePlatform: Platform = {
  scrollToMessage: (id) => scrollHandler?.(id),

  prefersDark: () => Appearance.getColorScheme() === "dark",
  onPrefersDarkChange: (cb) => {
    const sub = Appearance.addChangeListener(({ colorScheme }) =>
      cb(colorScheme === "dark"),
    );
    return () => sub.remove();
  },

  // An in-app browser sheet, not a jump to Safari — this is where MCP OAuth
  // lands, and bouncing out of the app mid-flow loses the callback.
  openExternal: (url) => void WebBrowser.openBrowserAsync(url),

  /**
   * `at` is what makes reminders work with the app backgrounded.
   *
   * The server pushes notifications over the WebSocket, which only reaches a
   * connected client — and a phone disconnects the moment it sleeps. Scheduling
   * locally from the timestamp means the notification fires regardless. This is
   * why the reminder and pomodoro services carry `at` in their payloads.
   */
  notify: ({ title, body, at }) => {
    void Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: at
        ? { type: SchedulableTriggerInputTypes.DATE, date: new Date(at) }
        : null,
    });
  },

  // A phone's socket dies silently while backgrounded; the chat screen pulls
  // a fresh message list whenever the app comes back to the front.
  onAppForeground: (cb) => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") cb();
    });
    return () => sub.remove();
  },

  startVoiceRecording,
  stopVoiceRecording,
};
