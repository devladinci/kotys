import { create } from "zustand";
import type {
  ModelListing,
  PermissionMode,
  ThinkEffort,
} from "@kotys/contracts";
import { OLLAMA_CLOUD_HOST, OLLAMA_LOCAL_HOST } from "@kotys/contracts";
import { getRpc, isUnauthorizedError } from "./clients.js";

const API_KEY_SETTING = "api_key";
const OMLX_ENABLED_SETTING = "omlx_enabled";
const OMLX_HOST_SETTING = "omlx_host";
const OMLX_API_KEY_SETTING = "omlx_api_key";
const DEFAULT_MODEL_SETTING = "default_model_info";
const THEME_SETTING = "theme";
const PINNED_CHATS_SETTING = "pinned_chat_ids";
const THINKING_EFFORT_SETTING = "thinking_effort";
const PERMISSION_MODE_SETTING = "permission_mode";
const STT_MODEL_SETTING = "stt_model";

export const DEFAULT_MODEL: ModelListing = {
  name: "kimi-k2.7-code",
  capabilities: ["vision", "thinking", "completion", "tools"],
  contextLength: 262144,
  source: "cloud",
  provider: "ollama",
  host: "https://ollama.com",
};

export const OMLX_HOST_PLACEHOLDER = "omlx";

export const providerOf = (m: ModelListing): string => m.provider ?? "ollama";

/**
 * The stt_model setting stores "provider:model" so the API resolver never
 * guesses the provider. These two helpers are the only place that format is
 * decoded/encoded.
 */
export const sttModelName = (setting: string | null): string | null => {
  if (!setting) return null;
  const sep = setting.indexOf(":");
  return sep > 0 ? setting.slice(sep + 1) : setting;
};

export const sttModelSetting = (provider: string, name: string): string =>
  `${provider}:${name}`;

export const hostFor = (m: ModelListing): string =>
  providerOf(m) === "ollama"
    ? m.source === "local"
      ? OLLAMA_LOCAL_HOST
      : (m.host ?? OLLAMA_CLOUD_HOST)
    : // Non-ollama providers speak OpenAI-compatible wire: host already
      // carries their /v1 base (oMLX seeded as http://127.0.0.1:7777/v1).
      (m.host ?? OMLX_HOST_PLACEHOLDER);

export type ThemeMode = "system" | "light" | "dark";

export const THINKING_EFFORTS: ThinkEffort[] = [
  "off",
  "low",
  "medium",
  "high",
  "max",
];

export const PERMISSION_MODES: PermissionMode[] = [
  "ask",
  "copilot",
  "autopilot",
];

const isThinkEffort = (v: unknown): v is ThinkEffort =>
  typeof v === "string" && (THINKING_EFFORTS as string[]).includes(v);

const isPermissionMode = (v: unknown): v is PermissionMode =>
  typeof v === "string" && (PERMISSION_MODES as string[]).includes(v);

interface AppState {
  apiKey: string;
  /** The key is write-only over the wire; this reports whether one is stored. */
  apiKeyPresent: boolean;
  /** oMLX (OpenAI-compatible) provider configuration. */
  omlxEnabled: boolean;
  omlxHost: string;
  omlxApiKey: string;
  omlxApiKeyPresent: boolean;
  defaultModel: ModelListing;
  modelsCache: ModelListing[];
  activeChatId: number | null;
  hydrated: boolean;
  /**
   * The daemon rejected our token (401). Hosts watch this to return to the
   * login/pairing screen instead of waiting forever on a hydrate that can
   * never succeed.
   */
  unauthorized: boolean;
  theme: ThemeMode;
  resolvedTheme: "light" | "dark";
  thinkingEffort: ThinkEffort;
  permissionMode: PermissionMode;
  sttModel: string | null;
  chatsVersion: number;
  /** Ids present in the last loaded chat list; chatSync consults it. */
  knownChatIds: Set<number>;
  settingsOpen: boolean;
  sidebarHidden: boolean;
  pinnedChatIds: Set<number>;
  setApiKey: (key: string) => Promise<void>;
  setOmlxEnabled: (enabled: boolean) => Promise<void>;
  setOmlxHost: (host: string) => Promise<void>;
  setOmlxApiKey: (key: string) => Promise<void>;
  setDefaultModel: (model: ModelListing) => Promise<void>;
  setModelsCache: (models: ModelListing[]) => Promise<void>;
  setActiveChatId: (id: number | null) => void;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setResolvedTheme: (resolved: "light" | "dark") => void;
  setThinkingEffort: (effort: ThinkEffort) => Promise<void>;
  setPermissionMode: (mode: PermissionMode) => Promise<void>;
  setSttModel: (model: string | null) => Promise<void>;
  hydrate: () => Promise<void>;
  /** Reset after a token was replaced, so a fresh hydrate can run. */
  resetAuth: () => void;
  bumpChatsVersion: () => void;
  setSettingsOpen: (open: boolean) => void;
  setSidebarHidden: (hidden: boolean) => void;
  togglePinned: (id: number) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  apiKey: "",
  apiKeyPresent: false,
  omlxEnabled: false,
  omlxHost: "",
  omlxApiKey: "",
  omlxApiKeyPresent: false,
  defaultModel: DEFAULT_MODEL,
  modelsCache: [],
  activeChatId: null,
  hydrated: false,
  unauthorized: false,
  theme: "system",
  // DOM-free: defaults to light. The app sets the real value through
  // platform.prefersDark() at startup.
  resolvedTheme: "light",
  thinkingEffort: "medium",
  permissionMode: "copilot",
  sttModel: null,
  chatsVersion: 0,
  knownChatIds: new Set<number>(),
  settingsOpen: false,
  sidebarHidden: false,
  pinnedChatIds: new Set<number>(),

  setApiKey: async (key) => {
    set({ apiKey: key, apiKeyPresent: key.length > 0 });
    await getRpc().settings.set({ key: API_KEY_SETTING, value: key });
  },

  setOmlxEnabled: async (enabled) => {
    set({ omlxEnabled: enabled });
    await getRpc().settings.set({
      key: OMLX_ENABLED_SETTING,
      value: String(enabled),
    });
  },

  setOmlxHost: async (host) => {
    set({ omlxHost: host });
    await getRpc().settings.set({ key: OMLX_HOST_SETTING, value: host });
  },

  setOmlxApiKey: async (key) => {
    set({ omlxApiKey: key, omlxApiKeyPresent: key.length > 0 });
    await getRpc().settings.set({ key: OMLX_API_KEY_SETTING, value: key });
  },

  setDefaultModel: async (model) => {
    set({ defaultModel: model });
    await getRpc().settings.set({
      key: DEFAULT_MODEL_SETTING,
      value: JSON.stringify(model),
    });
  },

  setModelsCache: async (models) => {
    set({ modelsCache: models });
    await getRpc().settings.set({
      key: "models_cache",
      value: JSON.stringify(models),
    });
  },

  setActiveChatId: (id) => set({ activeChatId: id }),

  setTheme: async (theme) => {
    set({ theme });
    await getRpc().settings.set({ key: THEME_SETTING, value: theme });
  },

  setResolvedTheme: (resolved) => set({ resolvedTheme: resolved }),

  setThinkingEffort: async (effort) => {
    set({ thinkingEffort: effort });
    await getRpc().settings.set({
      key: THINKING_EFFORT_SETTING,
      value: effort,
    });
  },

  setPermissionMode: async (mode) => {
    set({ permissionMode: mode });
    await getRpc().settings.set({
      key: PERMISSION_MODE_SETTING,
      value: mode,
    });
  },

  setSttModel: async (model) => {
    set({ sttModel: model });
    await getRpc().settings.set({
      key: STT_MODEL_SETTING,
      value: model ?? "",
    });
  },

  togglePinned: async (id) => {
    let next: Set<number>;
    set((s) => {
      next = new Set(s.pinnedChatIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { pinnedChatIds: next };
    });
    await getRpc().settings.set({
      key: PINNED_CHATS_SETTING,
      value: JSON.stringify([...next!]),
    });
  },

  hydrate: async () => {
    const rpc = getRpc();
    let values: [
      Awaited<ReturnType<typeof rpc.settings.get>>,
      Awaited<ReturnType<typeof rpc.settings.get>>,
      Awaited<ReturnType<typeof rpc.settings.get>>,
      { present: boolean },
      Awaited<ReturnType<typeof rpc.settings.get>>,
      Awaited<ReturnType<typeof rpc.settings.get>>,
      Awaited<ReturnType<typeof rpc.settings.get>>,
      Awaited<ReturnType<typeof rpc.settings.get>>,
      Awaited<ReturnType<typeof rpc.settings.get>>,
      { present: boolean },
      Awaited<ReturnType<typeof rpc.settings.get>>,
    ];
    try {
      values = await Promise.all([
        rpc.settings.get({ key: API_KEY_SETTING }),
        rpc.settings.get({ key: OMLX_ENABLED_SETTING }),
        rpc.settings.get({ key: OMLX_HOST_SETTING }),
        rpc.settings.hasSecret({ key: OMLX_API_KEY_SETTING }),
        rpc.settings.get({ key: DEFAULT_MODEL_SETTING }),
        rpc.settings.get({ key: THEME_SETTING }),
        rpc.settings.get({ key: PINNED_CHATS_SETTING }),
        rpc.settings.get({ key: THINKING_EFFORT_SETTING }),
        rpc.settings.get({ key: PERMISSION_MODE_SETTING }),
        rpc.settings.hasSecret({ key: API_KEY_SETTING }),
        rpc.settings.get({ key: STT_MODEL_SETTING }),
      ]);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        // Bad token: hosts watch this flag to return to login/pairing.
        set({ unauthorized: true });
        return;
      }
      throw error;
    }
    const [
      key,
      omlxEnabledVal,
      omlxHostVal,
      omlxKeyPresent,
      modelJson,
      themeVal,
      pinnedJson,
      effortVal,
      modeVal,
      keyPresent,
      sttModelVal,
    ] = values;
    let defaultModel = DEFAULT_MODEL;
    if (modelJson.value) {
      try {
        defaultModel = JSON.parse(modelJson.value) as ModelListing;
      } catch {
        // keep default
      }
    }
    const theme: ThemeMode =
      themeVal.value === "light" || themeVal.value === "dark"
        ? themeVal.value
        : "system";
    let pinnedChatIds = new Set<number>();
    if (pinnedJson.value) {
      try {
        const arr = JSON.parse(pinnedJson.value) as number[];
        if (Array.isArray(arr)) pinnedChatIds = new Set(arr);
      } catch {
        // ignore malformed
      }
    }
    set({
      apiKey: key.value ?? "",
      apiKeyPresent: keyPresent.present,
      omlxEnabled: omlxEnabledVal.value === "true",
      omlxHost: omlxHostVal.value ?? "",
      omlxApiKeyPresent: omlxKeyPresent.present,
      defaultModel,
      hydrated: true,
      theme,
      pinnedChatIds,
      ...(isThinkEffort(effortVal.value)
        ? { thinkingEffort: effortVal.value }
        : {}),
      ...(isPermissionMode(modeVal.value)
        ? { permissionMode: modeVal.value }
        : {}),
      sttModel: sttModelVal.value || null,
    });
  },

  resetAuth: () => {
    set({ unauthorized: false, hydrated: false });
  },

  bumpChatsVersion: () => set((s) => ({ chatsVersion: s.chatsVersion + 1 })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSidebarHidden: (hidden) => set({ sidebarHidden: hidden }),
}));
