import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { initTestClients } = await import("../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../test/platform");
const { stopSpeech, useSpeechStore } = await import("@kotys/core");
const { SpeakerButton } = await import("./SpeakerButton");

const renderButtons = () =>
  render(
    <KotysProviderForTest>
      <SpeakerButton messageId={1} content="First reply." />
      <SpeakerButton messageId={2} content="Second reply." />
    </KotysProviderForTest>,
  );

const labels = () =>
  screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label"));

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  stopSpeech();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
});

describe("SpeakerButton", () => {
  it("shows the active state only on the message being read", () => {
    useSpeechStore.setState({
      phase: "playing",
      messageId: 2,
      text: "Second reply.",
      error: null,
    });
    renderButtons();

    expect(labels()).toEqual(["Read aloud", "Stop reading"]);
  });

  it("starts reading the clicked message", async () => {
    renderButtons();
    await userEvent.click(screen.getAllByRole("button")[0]);

    expect(useSpeechStore.getState()).toMatchObject({
      phase: "loading",
      messageId: 1,
      text: "First reply.",
    });
    expect(labels()).toEqual(["Stop reading", "Read aloud"]);
  });

  it("stops when the active button is pressed, even while loading", async () => {
    useSpeechStore.setState({
      phase: "loading",
      messageId: 1,
      text: "First reply.",
      error: null,
    });
    renderButtons();
    await userEvent.click(screen.getByRole("button", { name: "Stop reading" }));

    expect(useSpeechStore.getState().phase).toBe("idle");
  });
});
