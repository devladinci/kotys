import type { Platform } from "@kotys/core";
import { getConfig } from "@kotys/core";
import { createVoiceRecorder } from "./voiceRecorder.js";
import { createSpeechPlayer } from "./speechPlayer.js";

interface ElectronBridge {
  notify: (n: { title: string; body: string }) => void;
}

const electron = (): ElectronBridge | undefined =>
  (window as unknown as { kotys?: ElectronBridge }).kotys;

const ensureNotificationPermission = () => {
  if (
    typeof Notification !== "undefined" &&
    Notification.permission === "default"
  ) {
    void Notification.requestPermission();
  }
};

let recorder: ReturnType<typeof createVoiceRecorder> | null = null;
let speechPlayer: ReturnType<typeof createSpeechPlayer> | null = null;

const player = () => {
  if (!speechPlayer) speechPlayer = createSpeechPlayer();
  return speechPlayer;
};

const requestSpeech = async (
  text: string,
  language?: string,
): Promise<Blob> => {
  const config = getConfig();
  const res = await fetch(`${config.baseUrl}/tts/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, language: language ?? undefined }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Speech synthesis failed (${res.status})`);
  }
  return res.blob();
};

export const webPlatform: Platform = {
  scrollToMessage: (id) => {
    document
      .querySelector(`[data-message-id="${id}"]`)
      ?.scrollIntoView({ block: "center" });
  },
  prefersDark: () =>
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  onPrefersDarkChange: (cb) => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => cb(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  },
  openExternal: (url) => window.open(url, "_blank", "noopener,noreferrer"),
  // The desktop window sits on a Tailscale/localhost socket that can die
  // silently (sleep, network switch). Visibility transitions are the web
  // equivalent of the mobile foreground event: refetch on refocus.
  onAppForeground: (cb) => {
    const handler = () => {
      if (document.visibilityState === "visible") cb();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  },
  notify: ({ title, body }) => {
    ensureNotificationPermission();
    if (Notification.permission === "granted")
      new Notification(title, { body });
  },
  startVoiceRecording: async () => {
    recorder = createVoiceRecorder();
    await recorder.start();
  },
  stopVoiceRecording: async () => {
    const rec = recorder;
    recorder = null;
    if (!rec) throw new Error("Not recording");
    const { blob, mimeType } = await rec.stop();
    return { blob, mimeType };
  },
  playSpeech: async ({ text, language }) => {
    const audio = await requestSpeech(text, language);
    await player().play(audio);
  },
  stopSpeech: () => {
    player().stop();
  },
};

export const desktopPlatform: Platform = {
  ...webPlatform,
  // Main-process notifications: renderer HTML5 notifications have no
  // permission store for the app://kotys origin.
  notify: ({ title, body }) => electron()?.notify({ title, body }),
};
