import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock(
  "@kotys/client",
  async () => await import("../../../test/mocks/client"),
);
const { rpc, initTestClients } = await import("../../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../../test/platform");
const { useAppStore } = await import("@kotys/core");
const { ReferenceVoice } = await import("./ReferenceVoice");

const fetchMock = vi.fn<typeof fetch>();
const clip = new File(["RIFF....WAVE"], "voice.wav", { type: "audio/wav" });

const renderReference = () =>
  render(
    <KotysProviderForTest>
      <ReferenceVoice />
    </KotysProviderForTest>,
  );

const requestTo = (path: string) =>
  fetchMock.mock.calls.find(([url]) => String(url).endsWith(path));

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  useAppStore.setState({ sttModel: null });
  vi.mocked(rpc.tts.reference).mockResolvedValue({ isSet: false, text: "" });
});

describe("ReferenceVoice", () => {
  it("explains why a reference helps when none is set", async () => {
    renderReference();

    expect(
      await screen.findByText(/voice can change from one sentence/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save reference" }),
    ).toBeDisabled();
  });

  it("fills the transcript from the clip when dictation is set up", async () => {
    useAppStore.setState({ sttModel: "omlx:whisper" });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ text: "Words from the clip." })),
    );
    renderReference();
    await userEvent.upload(screen.getByLabelText("Clip (WAV)"), clip);

    expect(
      await screen.findByDisplayValue("Words from the clip."),
    ).toBeInTheDocument();
    expect(requestTo("/voice/audio/transcriptions")).toBeDefined();
  });

  it("uploads the clip with its transcript and shows it as set", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    renderReference();
    await userEvent.upload(screen.getByLabelText("Clip (WAV)"), clip);
    await userEvent.type(
      screen.getByLabelText("Words spoken in the clip"),
      "Hello there.",
    );
    vi.mocked(rpc.tts.reference).mockResolvedValue({
      isSet: true,
      text: "Hello there.",
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save reference" }),
    );

    const [, init] = requestTo("/tts/reference") ?? [];
    const form = init?.body as FormData;
    expect(form.get("text")).toBe("Hello there.");
    expect(form.get("file")).toBeInstanceOf(File);
    expect(await screen.findByText("“Hello there.”")).toBeInTheDocument();
  });

  it("shows why an upload was refused", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "The reference clip must be a WAV file" }),
        { status: 400 },
      ),
    );
    renderReference();
    await userEvent.upload(screen.getByLabelText("Clip (WAV)"), clip);
    await userEvent.type(
      screen.getByLabelText("Words spoken in the clip"),
      "Hi.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save reference" }),
    );

    expect(
      await screen.findByText("The reference clip must be a WAV file"),
    ).toBeInTheDocument();
  });

  it("removes the saved reference", async () => {
    vi.mocked(rpc.tts.reference).mockResolvedValue({
      isSet: true,
      text: "Hello there.",
    });
    renderReference();
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" }),
    );

    expect(rpc.tts.removeReference).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(rpc.tts.reference).toHaveBeenCalledTimes(2));
  });
});
