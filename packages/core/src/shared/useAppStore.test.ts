import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../shared/clients.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/clients.js")>()),
  getRpc: vi.fn(),
  getSocket: vi.fn(),
  getConfig: vi.fn(),
}));

const { useAppStore } = await import("./useAppStore.js");
const { getRpc } = await import("../shared/clients.js");

const settingsGet = vi.fn();
const settingsSet = vi.fn();
const settingsHasSecret = vi.fn();
vi.mocked(getRpc).mockReturnValue({
  settings: {
    get: settingsGet,
    set: settingsSet,
    hasSecret: settingsHasSecret,
  },
} as unknown as ReturnType<typeof getRpc>);

describe("useAppStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsHasSecret.mockResolvedValue({ present: false });
    vi.mocked(getRpc).mockReturnValue({
      settings: {
        get: settingsGet,
        set: settingsSet,
        hasSecret: settingsHasSecret,
      },
    } as unknown as ReturnType<typeof getRpc>);
    useAppStore.setState({
      apiKey: "",
      apiKeyPresent: false,
      defaultModel: {
        name: "default",
        capabilities: [],
        contextLength: null,
        source: "cloud",
        host: "https://ollama.com",
      },
      modelsCache: [],
      activeChatId: null,
      hydrated: false,
      unauthorized: false,
      chatsVersion: 0,
      settingsOpen: false,
    });
  });

  it("hydrate loads apiKey and defaultModel from settings", async () => {
    settingsGet.mockImplementation(async (input: { key: string }) => {
      if (input.key === "api_key")
        return { value: "ollama_test_key", secret: false as const };
      if (input.key === "default_model_info")
        return {
          value: JSON.stringify({
            name: "custom",
            capabilities: ["vision"],
            contextLength: 8192,
            source: "local",
          }),
          secret: false as const,
        };
      return { value: null, secret: false as const };
    });
    settingsHasSecret.mockResolvedValue({ present: true });

    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.hydrate());

    expect(result.current.apiKey).toBe("ollama_test_key");
    expect(result.current.apiKeyPresent).toBe(true);
    expect(result.current.defaultModel.name).toBe("custom");
    expect(result.current.defaultModel.source).toBe("local");
    expect(result.current.hydrated).toBe(true);
  });

  it("hydrate marks a stored secret as present even when it is not returned", async () => {
    // Secret keys are write-only over the wire: get() returns null.
    settingsGet.mockImplementation(async (input: { key: string }) => ({
      value: null,
      secret: input.key === "api_key",
    }));
    settingsHasSecret.mockResolvedValue({ present: true });

    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.hydrate());

    expect(result.current.apiKey).toBe("");
    expect(result.current.apiKeyPresent).toBe(true);
  });

  it("setApiKey persists via RPC and updates state", async () => {
    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.setApiKey("new_key"));
    expect(result.current.apiKey).toBe("new_key");
    expect(result.current.apiKeyPresent).toBe(true);
    expect(settingsSet).toHaveBeenCalledWith({
      key: "api_key",
      value: "new_key",
    });
  });

  it("setActiveChatId updates state without RPC", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.setActiveChatId(42));
    expect(result.current.activeChatId).toBe(42);
  });

  it("hydrate keeps module default when stored model JSON is invalid", async () => {
    settingsGet.mockResolvedValue({
      value: "not-json",
      secret: false as const,
    });
    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.hydrate());
    expect(result.current.defaultModel.name).toBe("kimi-k2.7-code");
    expect(result.current.hydrated).toBe(true);
  });

  it("hydrate flags unauthorized instead of throwing on a 401", async () => {
    // Emulates the oRPC client wrapping the daemon's plain 401 body.
    const unauthorizedError = Object.assign(new Error("Unauthorized"), {
      code: "UNAUTHORIZED",
      status: 401,
    });
    settingsGet.mockRejectedValue(unauthorizedError);
    settingsHasSecret.mockRejectedValue(unauthorizedError);
    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.hydrate());
    expect(result.current.unauthorized).toBe(true);
    expect(result.current.hydrated).toBe(false);
  });

  it("hydrate rethrows non-401 failures", async () => {
    settingsGet.mockRejectedValue(new Error("Network request failed"));
    const { result } = renderHook(() => useAppStore());
    await act(async () => {
      await expect(result.current.hydrate()).rejects.toThrow(
        "Network request failed",
      );
    });
    expect(result.current.unauthorized).toBe(false);
  });

  it("resetAuth clears the unauthorized flag and re-arms hydration", async () => {
    const unauthorizedError = Object.assign(new Error("Unauthorized"), {
      code: "UNAUTHORIZED",
      status: 401,
    });
    settingsGet.mockRejectedValue(unauthorizedError);
    useAppStore.setState({ unauthorized: true });
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.resetAuth());
    expect(result.current.unauthorized).toBe(false);
    expect(result.current.hydrated).toBe(false);
  });

  it("bumpChatsVersion increments the version", () => {
    const { result } = renderHook(() => useAppStore());
    const start = result.current.chatsVersion;
    act(() => result.current.bumpChatsVersion());
    expect(result.current.chatsVersion).toBe(start + 1);
  });

  it("setSettingsOpen toggles the settings panel flag", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.setSettingsOpen(true));
    expect(result.current.settingsOpen).toBe(true);
    act(() => result.current.setSettingsOpen(false));
    expect(result.current.settingsOpen).toBe(false);
  });

  it("setSttModel persists provider-tagged value via RPC", async () => {
    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.setSttModel("omlx:parakeet-tdt-0.6b-v3"));
    expect(result.current.sttModel).toBe("omlx:parakeet-tdt-0.6b-v3");
    expect(settingsSet).toHaveBeenCalledWith({
      key: "stt_model",
      value: "omlx:parakeet-tdt-0.6b-v3",
    });
  });

  it("setSttModel(null) clears the selection", async () => {
    useAppStore.setState({ sttModel: "omlx:parakeet-tdt-0.6b-v3" });
    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.setSttModel(null));
    expect(result.current.sttModel).toBe(null);
    expect(settingsSet).toHaveBeenCalledWith({ key: "stt_model", value: "" });
  });

  it("hydrate reads stt_model (empty value = null)", async () => {
    settingsGet.mockImplementation(async (input: { key: string }) => ({
      value: input.key === "stt_model" ? "omlx:parakeet" : null,
      secret: false as const,
    }));
    settingsHasSecret.mockResolvedValue({ present: false });
    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.hydrate());
    expect(result.current.sttModel).toBe("omlx:parakeet");
  });

  it("hydrate maps empty stt_model string to null", async () => {
    settingsGet.mockImplementation(async () => ({
      value: null,
      secret: false as const,
    }));
    settingsHasSecret.mockResolvedValue({ present: false });
    const { result } = renderHook(() => useAppStore());
    await act(() => result.current.hydrate());
    expect(result.current.sttModel).toBe(null);
  });
});
