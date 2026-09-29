import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock(
  "@kotys/client",
  async () => await import("../../../test/mocks/client"),
);
const { initTestClients } = await import("../../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../../test/platform");
const { ReadAloudProvider } = await import("./ReadAloudProvider");
const { ReadAloudPlayer } = await import("./ReadAloudPlayer");
const { SpeakerButton } = await import("../SpeakerButton");

const renderPlayer = () =>
  render(
    <KotysProviderForTest>
      <ReadAloudProvider>
        <SpeakerButton messageId={7} content="Read this reply." />
        <ReadAloudPlayer />
      </ReadAloudProvider>
    </KotysProviderForTest>,
  );

const readAloud = () =>
  userEvent.click(screen.getByRole("button", { name: "Read aloud" }));

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
});

describe("ReadAloudPlayer", () => {
  it("stays hidden until a reply is read", () => {
    renderPlayer();

    expect(screen.queryByRole("region", { name: "Read aloud" })).toBeNull();
  });

  it("says it is preparing audio while the speech loads", async () => {
    renderPlayer();
    await readAloud();

    expect(await screen.findByText("Preparing audio…")).toBeDefined();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDefined();
  });

  it("shows why speech failed, as the server put it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "No text-to-speech model selected" },
          { status: 400 },
        ),
      ),
    );
    renderPlayer();
    await readAloud();

    expect(
      await screen.findByText("No text-to-speech model selected"),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
  });

  it("says when Kotys cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    renderPlayer();
    await readAloud();

    expect(
      await screen.findByText("The speech engine can't be reached."),
    ).toBeDefined();
  });
});
