import { createContext, useContext, type ReactNode } from "react";
import type { KotysConfig } from "@kotys/client";
import type { RouterClient } from "@orpc/server";
import type { AppRouter, ClientMessage, ServerMessage } from "@kotys/api";
import { setClients, getRpc } from "./clients.js";
import { useMemoOnce } from "./useMemoOnce.js";

export type { ClientMessage, ServerMessage };

/**
 * Capabilities the host app provides.
 *
 * Everything here is something React Native does differently from the DOM.
 * Keeping them in one injected object is what lets every hook below stay
 * platform-free.
 */
export type VoiceRecording = {
  /** Web: recorded audio blob. */
  blob?: Blob;
  /** Mobile: file URI of the recording. */
  uri?: string;
  mimeType: string;
};

export type Platform = {
  /** Scroll a message into view. DOM apps query the node; RN uses a list ref. */
  scrollToMessage: (messageId: number) => void;
  /** Whether the OS is in dark mode, and a subscription to changes. */
  prefersDark: () => boolean;
  onPrefersDarkChange?: (cb: (dark: boolean) => void) => () => void;
  /** Open an external URL — system browser on desktop, in-app sheet on mobile. */
  openExternal: (url: string) => void;
  /**
   * Subscribe to app foreground transitions (mobile only). A phone's socket
   * dies silently while backgrounded; hosts can use this to resync. Undefined
   * on desktop/web, where the app is always visible.
   */
  onAppForeground?: (cb: () => void) => () => void;
  /** Show or schedule a notification. */
  notify: (n: { title: string; body: string; at?: number }) => void;
  /** Hold-to-talk voice input; hosts without a mic throw. */
  startVoiceRecording?: () => Promise<void>;
  stopVoiceRecording?: () => Promise<VoiceRecording>;
  /**
   * Desktop backend selection. Present when the host can host or join a
   * shared backend (Electron desktop): "own" spawns this machine's daemon,
   * "connect" attaches to another instance's daemon and shares its database.
   * Hosts without it (web, mobile) always run against the backend they were
   * pointed at and need no setting.
   */
  backend?: {
    /** The persisted mode; "own" unless previously changed. */
    get: () => Promise<unknown>;
    /**
     * Persist a new mode ("own", or a `host|token` connect code) without
     * restarting; takes effect on the next restart or backend:restart.
     */
    set: (
      mode:
        | { kind: "own" }
        | { kind: "connect"; connectCode: string },
    ) => Promise<unknown>;
    /** Reload the window against the persisted backend config. */
    restart: () => Promise<void>;
    /** `<host>|<token>` for this instance, or "" when no daemon is running. */
    connectCode: () => Promise<{ host: string; code: string }>;
  };
};

/**
 * Upload a recording to the API's /stt/transcribe route. Web fetch appends a
 * Blob directly; RN's global fetch (expo/fetch) cannot serialize {uri} file
 * parts, so mobile uploads through XHR, whose native layer streams the file.
 */
const audioFilename = (mimeType: string | undefined): string => {
  if (mimeType?.includes("wav")) return "audio.wav";
  if (mimeType?.includes("mp4") || mimeType?.includes("aac")) {
    return "audio.mp4";
  }
  return "audio.webm";
};

const xhrTranscribe = (
  url: string,
  token: string,
  file: { uri: string; name: string; type: string },
): Promise<string> =>
  new Promise((resolve, reject) => {
    const XhrCtor = (globalThis as Record<string, unknown>)[
      "XMLHttpRequest"
    ] as new () => {
      open: (method: string, url: string) => void;
      setRequestHeader: (name: string, value: string) => void;
      onload: (() => void) | null;
      onerror: (() => void) | null;
      status: number;
      responseText: string;
      send: (body: unknown) => void;
    };
    const xhr = new XhrCtor();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Transcription failed (${xhr.status})`));
        return;
      }
      try {
        resolve((JSON.parse(xhr.responseText) as { text?: string }).text ?? "");
      } catch {
        reject(new Error("Transcription returned invalid JSON"));
      }
    };
    xhr.onerror = () => reject(new Error("Transcription request failed"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });

export const transcribeVoice = async (
  config: { baseUrl: string; token: string },
  recording: VoiceRecording,
): Promise<string> => {
  const filename = audioFilename(recording.mimeType);
  if (recording.blob) {
    const form = new FormData();
    form.append("file", recording.blob, filename);
    const res = await fetch(`${config.baseUrl}/stt/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? `Transcription failed (${res.status})`);
    }
    const body = (await res.json()) as { text?: string };
    return body.text ?? "";
  }
  if (recording.uri) {
    return xhrTranscribe(`${config.baseUrl}/stt/transcribe`, config.token, {
      uri: recording.uri,
      name: filename,
      type: recording.mimeType,
    });
  }
  throw new Error("Empty recording");
};

type KotysContextValue = {
  rpc: RouterClient<AppRouter>;
  socket: ReturnType<typeof setClients>;
  platform: Platform;
};

const KotysContext = createContext<KotysContextValue | null>(null);

export function KotysProvider({
  config,
  platform,
  children,
}: {
  config: KotysConfig;
  platform: Platform;
  children: ReactNode;
}) {
  const value = useMemoOnce<KotysContextValue>(() => {
    const socket = setClients(config);
    return { rpc: getRpc(), socket, platform };
  });
  return (
    <KotysContext.Provider value={value}>{children}</KotysContext.Provider>
  );
}

export function useKotys(): KotysContextValue {
  const ctx = useContext(KotysContext);
  if (!ctx) throw new Error("useKotys must be used inside <KotysProvider>");
  return ctx;
}

export const useRpc = () => useKotys().rpc;
export const useSocket = () => useKotys().socket;
export const usePlatform = () => useKotys().platform;
