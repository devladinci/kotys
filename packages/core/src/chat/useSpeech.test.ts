import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../shared/provider.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/provider.js")>()),
  usePlatform: () => platformMock,
}));

const platformMock: {
  playSpeech?: (req: { text: string }) => Promise<void>;
  stopSpeech?: () => void;
} = {};

const { useSpeech } = await import("./useSpeech.js");
const { useAppStore } = await import("../shared/useAppStore.js");

beforeEach(() => {
  vi.clearAllMocks();
  delete platformMock.playSpeech;
  delete platformMock.stopSpeech;
  useAppStore.setState({ ttsModel: "omlx:higgs_audio_v3-tts-4b" });
});

describe("useSpeech", () => {
  it("errors on hosts without a player", async () => {
    const { result } = renderHook(() => useSpeech());
    await act(() => result.current.speak("Hello"));
    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("not supported");
    expect(platformMock.playSpeech).toBeUndefined();
  });

  it("errors without a tts_model selection", async () => {
    platformMock.playSpeech = async () => {};
    useAppStore.setState({ ttsModel: null });
    const { result } = renderHook(() => useSpeech());
    await act(() => result.current.speak("Hello"));
    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("No text-to-speech");
  });

  it("synthesizes and plays on demand", async () => {
    platformMock.playSpeech = vi.fn(async () => {});
    platformMock.stopSpeech = vi.fn();
    const { result } = renderHook(() => useSpeech());
    await act(() => result.current.speak("Здравей"));
    expect(platformMock.playSpeech).toHaveBeenCalledWith({ text: "Здравей" });
    expect(result.current.status).toBe("playing");
  });

  it("stop resets to idle and calls the platform", async () => {
    platformMock.playSpeech = vi.fn(async () => {});
    platformMock.stopSpeech = vi.fn();
    const { result } = renderHook(() => useSpeech());
    await act(() => result.current.speak("Hello"));
    act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(platformMock.stopSpeech).toHaveBeenCalledTimes(1);
  });

  it("shares state between two hook instances", async () => {
    platformMock.playSpeech = vi.fn(async () => {});
    const first = renderHook(() => useSpeech());
    const second = renderHook(() => useSpeech());
    await act(() => first.result.current.speak("Hello"));
    expect(second.result.current.status).toBe("playing");
    expect(second.result.current.text).toBe("Hello");
  });

  it("surfaces synthesis failures", async () => {
    platformMock.playSpeech = async () => {
      throw new Error("boom");
    };
    const { result } = renderHook(() => useSpeech());
    await act(() => result.current.speak("Hello"));
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("boom");
  });

  it("keeps playing across hook unmount", async () => {
    platformMock.playSpeech = vi.fn(async () => {});
    platformMock.stopSpeech = vi.fn();
    const { result, unmount } = renderHook(() => useSpeech());
    await act(() => result.current.speak("Hello"));
    unmount();
    expect(platformMock.stopSpeech).not.toHaveBeenCalled();
    expect(useAppStore.getState().ttsModel).toBeTruthy();
  });
});
