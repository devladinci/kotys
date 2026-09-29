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

describe("useVoiceInput live", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConfig).mockReturnValue({
      baseUrl: "http://test",
      token: "t",
    } as never);
    transcribeVoiceMock.mockResolvedValue("From the recording");
  });

  const makeStream = (finished: string | null) => {
    const heard: { push: (text: string) => void } = { push: () => {} };
    const stream = {
      finish: vi.fn(async () => finished),
      cancel: vi.fn(),
    };
    const streamVoice = vi.fn(
      (
        _config: { baseUrl: string; token: string },
        onText: (t: string) => void,
      ) => {
        heard.push = onText;
        return stream;
      },
    );
    return { stream, streamVoice, heard };
  };

  it("shows the words while they are spoken and keeps the streamed text", async () => {
    const { stream, streamVoice, heard } = makeStream("Hello there.");
    const live = { onText: vi.fn(), onEnd: vi.fn() };
    const onTranscript = vi.fn();
    const platform = makePlatform({ streamVoice });
    const { result } = renderHook(() =>
      useVoiceInput(platform, onTranscript, live),
    );

    await act(() => result.current.start());
    expect(streamVoice).toHaveBeenCalledWith(
      { baseUrl: "http://test", token: "t" },
      expect.any(Function),
    );
    act(() => heard.push("Hello"));
    expect(live.onText).toHaveBeenLastCalledWith("Hello");

    await act(() => result.current.stop());
    expect(stream.finish).toHaveBeenCalledTimes(1);
    expect(live.onEnd).toHaveBeenCalledWith("Hello there.");
    expect(transcribeVoiceMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("transcribes the recording when the stream broke off", async () => {
    const { streamVoice } = makeStream(null);
    const live = { onText: vi.fn(), onEnd: vi.fn() };
    const platform = makePlatform({ streamVoice });
    const { result } = renderHook(() => useVoiceInput(platform, vi.fn(), live));

    await act(() => result.current.start());
    await act(() => result.current.stop());
    expect(transcribeVoiceMock).toHaveBeenCalledTimes(1);
    expect(live.onEnd).toHaveBeenCalledWith("From the recording");
  });

  it("drops the streamed words on cancel", async () => {
    const { stream, streamVoice } = makeStream("Hello");
    const live = { onText: vi.fn(), onEnd: vi.fn() };
    const platform = makePlatform({ streamVoice });
    const { result } = renderHook(() => useVoiceInput(platform, vi.fn(), live));

    await act(() => result.current.start());
    await act(() => result.current.cancel());
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(live.onEnd).toHaveBeenCalledWith(null);
    expect(transcribeVoiceMock).not.toHaveBeenCalled();
  });

  it("keeps what was shown when the fallback fails too", async () => {
    transcribeVoiceMock.mockRejectedValue(new Error("oMLX down"));
    const { streamVoice, heard } = makeStream(null);
    const live = { onText: vi.fn(), onEnd: vi.fn() };
    const platform = makePlatform({ streamVoice });
    const { result } = renderHook(() => useVoiceInput(platform, vi.fn(), live));

    await act(() => result.current.start());
    act(() => heard.push("Half a sentence"));
    await act(() => result.current.stop());
    expect(live.onEnd).toHaveBeenCalledWith("Half a sentence");
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("oMLX down");
  });

  it("sends the transcript as before when the model does not stream", async () => {
    const { streamVoice } = makeStream("unused");
    const onTranscript = vi.fn();
    const platform = makePlatform({ streamVoice });
    const { result } = renderHook(() => useVoiceInput(platform, onTranscript));

    await act(() => result.current.start());
    await act(() => result.current.stop());
    expect(streamVoice).not.toHaveBeenCalled();
    expect(onTranscript).toHaveBeenCalledWith("From the recording");
  });
});
