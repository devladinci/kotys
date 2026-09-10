import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../shared/clients.js", () => ({
  getConfig: vi.fn(),
  getRpc: vi.fn(),
  getSocket: vi.fn(),
}));

vi.mock("../shared/provider.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/provider.js")>()),
  transcribeVoice: vi.fn(),
}));

const { useVoiceInput } = await import("./useVoiceInput.js");
const { transcribeVoice } = await import("../shared/provider.js");
const { getConfig } = await import("../shared/clients.js");

const transcribeVoiceMock = vi.mocked(transcribeVoice);

const makePlatform = (
  overrides: Partial<Parameters<typeof useVoiceInput>[0]> = {},
) => ({
  scrollToMessage: () => {},
  prefersDark: () => false,
  openExternal: () => {},
  notify: () => {},
  startVoiceRecording: vi.fn().mockResolvedValue(undefined),
  stopVoiceRecording: vi
    .fn()
    .mockResolvedValue({ blob: new Blob(["x"]), mimeType: "audio/webm" }),
  ...overrides,
});

describe("useVoiceInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({
      baseUrl: "http://test",
      token: "t",
    } as never);
    transcribeVoiceMock.mockResolvedValue("Hello world");
  });

  it("idle → recording → idle, transcript delivered", async () => {
    const onTranscript = vi.fn();
    const platform = makePlatform();
    const { result } = renderHook(() => useVoiceInput(platform, onTranscript));

    await act(() => result.current.start());
    expect(result.current.status).toBe("recording");
    expect(platform.startVoiceRecording).toHaveBeenCalledTimes(1);

    await act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(transcribeVoiceMock).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith("Hello world");
  });

  it("guards double start", async () => {
    const platform = makePlatform();
    const { result } = renderHook(() => useVoiceInput(platform, vi.fn()));
    await act(() => result.current.start());
    await act(() => result.current.start());
    expect(platform.startVoiceRecording).toHaveBeenCalledTimes(1);
  });

  it("cancel stops without transcribing", async () => {
    const onTranscript = vi.fn();
    const platform = makePlatform();
    const { result } = renderHook(() => useVoiceInput(platform, onTranscript));
    await act(() => result.current.start());
    await act(() => result.current.cancel());
    expect(result.current.status).toBe("idle");
    expect(platform.stopVoiceRecording).toHaveBeenCalledTimes(1);
    expect(transcribeVoiceMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("unsupported platform → error status", async () => {
    const platform = makePlatform({
      startVoiceRecording: undefined,
      stopVoiceRecording: undefined,
    });
    const { result } = renderHook(() => useVoiceInput(platform, vi.fn()));
    await act(() => result.current.start());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("not supported");
  });

  it("transcription failure → error status with message", async () => {
    transcribeVoiceMock.mockRejectedValue(new Error("oMLX down"));
    const platform = makePlatform();
    const { result } = renderHook(() => useVoiceInput(platform, vi.fn()));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("oMLX down");
  });

  it("empty transcript does not call onTranscript", async () => {
    transcribeVoiceMock.mockResolvedValue("  ");
    const onTranscript = vi.fn();
    const platform = makePlatform();
    const { result } = renderHook(() => useVoiceInput(platform, onTranscript));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(onTranscript).not.toHaveBeenCalled();
  });
});
