import type { Platform } from "@kotys/core";
import { createVoiceRecorder } from "./voiceRecorder.js";

interface ElectronBridge {
  notify: (n: { title: string; body: string }) => void;
  // Optional in practice on older builds; the desktop preload always
  // provides them, web/mobile never see this bridge at all.
  getBackend?: () => Promise<unknown>;
  setBackend?: (mode: unknown) => Promise<unknown>;
  restartWithBackend?: () => Promise<void>;
  connectCode?: () => Promise<{ host: string; code: string }>;
  discoverBackends?: () => Promise<
    | { status: "ok"; instances: { name: string; host: string }[] }
    | { status: "unavailable"; error: string }
  >;
  pairWithBackend?: (req: { host: string; code: string }) => Promise<unknown>;
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
};

export const desktopPlatform: Platform = {
  ...webPlatform,
  // Main-process notifications: renderer HTML5 notifications have no
  // permission store for the app://kotys origin.
  notify: ({ title, body }) => electron()?.notify({ title, body }),
  // The Electron bridge can host or join a shared backend; the window
  // reloads against the persisted choice.
  backend: {
    get: async () => electron()?.getBackend?.(),
    set: (mode) => {
      const bridge = electron();
      if (!bridge?.setBackend) throw new Error("Backend not configurable");
      return bridge.setBackend(mode);
    },
    restart: async () => {
      await electron()?.restartWithBackend?.();
    },
    connectCode: async () =>
      (await electron()?.connectCode?.()) ?? { host: "", code: "" },
    discover: async () => {
      const bridge = electron();
      if (!bridge?.discoverBackends) {
        return {
          status: "unavailable" as const,
          error: "Pairing needs the desktop app.",
        };
      }
      return bridge.discoverBackends();
    },
    pair: async (req) => {
      const bridge = electron();
      if (!bridge?.pairWithBackend) {
        throw new Error("Pairing needs the desktop app.");
      }
      const result = await bridge.pairWithBackend(req);
      if (
        !result ||
        typeof result !== "object" ||
        (result as { kind?: unknown }).kind !== "connect"
      ) {
        throw new Error("Pairing failed");
      }
      return { kind: "connect" as const, host: req.host };
    },
  },
};
