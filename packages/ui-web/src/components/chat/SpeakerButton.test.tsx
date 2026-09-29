import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { initTestClients } = await import("../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../test/platform");
const { ReadAloudProvider } = await import("./readAloud/ReadAloudProvider");
const { SpeakerButton } = await import("./SpeakerButton");

const TABLE_REPLY = [
  "Two plans:",
  "",
  "| Plan | Price |",
  "| --- | --- |",
  "| Free | 0 |",
].join("\n");

let fetchMock: Mock;

const renderButtons = (second = "Second reply.") =>
  render(
    <KotysProviderForTest>
      <ReadAloudProvider>
        <SpeakerButton messageId={1} content="First reply." />
        <SpeakerButton messageId={2} content={second} />
      </ReadAloudProvider>
    </KotysProviderForTest>,
  );

const labels = () =>
  screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label"));

const spoken = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith("/tts/speech"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)).text);

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  fetchMock = vi.fn((url: string) =>
    url.endsWith("/tts/summary")
      ? Promise.resolve(Response.json({ text: "A free plan and a paid one." }))
      : new Promise<Response>(() => {}),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("SpeakerButton", () => {
  it("shows the active state only on the message being read", async () => {
    renderButtons();
    await userEvent.click(screen.getAllByRole("button")[1]);

    expect(labels()).toEqual(["Read aloud", "Stop reading"]);
  });

  it("reads the clicked message", async () => {
    renderButtons();
    await userEvent.click(screen.getAllByRole("button")[0]);

    await waitFor(() => expect(spoken()).toEqual(["First reply."]));
  });

  it("stops when the active button is pressed, even while loading", async () => {
    renderButtons();
    await userEvent.click(screen.getAllByRole("button")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Stop reading" }));

    expect(labels()).toEqual(["Read aloud", "Read aloud"]);
  });

  it("reads a reply with a table as the summary the server writes", async () => {
    renderButtons(TABLE_REPLY);
    await userEvent.click(screen.getAllByRole("button")[1]);

    await waitFor(() =>
      expect(spoken()).toEqual(["A free plan and a paid one."]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://test/tts/summary",
      expect.objectContaining({ body: JSON.stringify({ messageId: 2 }) }),
    );
  });
});
