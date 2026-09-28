import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SpeechPhase } from "@kotys/core";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { initTestClients } = await import("../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../test/platform");
const { stopSpeech, useSpeechStore } = await import("@kotys/core");
const { SpeechBar } = await import("./SpeechBar");

const show = (phase: SpeechPhase, error: string | null = null) =>
  act(() => {
    useSpeechStore.setState({
      phase,
      messageId: 3,
      text: "Reading this reply.",
      error,
    });
  });

const buttonNames = () =>
  screen.queryAllByRole("button").map((b) => b.textContent || b.ariaLabel);

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  stopSpeech();
  render(
    <KotysProviderForTest>
      <SpeechBar />
    </KotysProviderForTest>,
  );
});

describe("SpeechBar", () => {
  it("is hidden while nothing is being read", () => {
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says it is preparing audio and offers stop while loading", () => {
    show("loading");

    expect(screen.getByRole("status")).toHaveTextContent("Preparing audio…");
    expect(buttonNames()).toEqual(["Stop"]);
  });

  it("shows the text being read while playing", () => {
    show("playing");

    expect(screen.getByRole("status")).toHaveTextContent("Reading this reply.");
    expect(buttonNames()).toEqual(["Stop"]);
  });

  it("offers replay and close after playback", () => {
    show("done");

    expect(buttonNames()).toEqual(["Replay", "Close"]);
  });

  it("shows why speech failed and offers a retry", () => {
    show("error", "No text-to-speech model selected");

    expect(screen.getByRole("status")).toHaveTextContent(
      "No text-to-speech model selected",
    );
    expect(buttonNames()).toEqual(["Retry", "Close"]);
  });

  it("stop and close both return to idle", async () => {
    show("playing");
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(useSpeechStore.getState().phase).toBe("idle");

    show("done");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useSpeechStore.getState().phase).toBe("idle");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
