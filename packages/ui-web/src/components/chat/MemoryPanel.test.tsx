import {
  describe,
  expect,
  it,
  beforeEach,
  vi,
  type MockedFunction,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { rpc, initTestClients } = await import("../../test/mocks/rpc");
const { KotysProviderForTest: KotysProvider } =
  await import("../../test/platform");

const MemorySettings = (await import("../settings/MemorySettings")).default;

const rpcListMemories = rpc.memories.list as MockedFunction<
  typeof rpc.memories.list
>;
const rpcDeleteMemory = rpc.memories.remove as MockedFunction<
  typeof rpc.memories.remove
>;
const rpcUpdateMemory = rpc.memories.update as MockedFunction<
  typeof rpc.memories.update
>;

const memory = {
  id: 3,
  key: "prefers-vitest",
  content: "Prefers Vitest over Jest.",
  type: "preference" as const,
  source_chat_id: 5,
  source_chat_title: "Testing setup",
  topics: ["testing", "tooling"],
  created_at: 0,
  updated_at: 1_700_000_000,
};

const other = {
  ...memory,
  id: 4,
  key: "ships-on-fridays",
  content: "Deploys the desktop build on Fridays.",
  type: "project" as const,
  source_chat_id: 8,
  source_chat_title: "Release process",
  topics: ["release"],
};

const renderSettings = () =>
  render(
    <KotysProvider>
      <MemorySettings />
    </KotysProvider>,
  );

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  rpcListMemories.mockResolvedValue([memory, other] as never);
});

describe("MemorySettings", () => {
  it("lists saved memories with their type and topics", async () => {
    renderSettings();
    expect(await screen.findByText("Prefers Vitest over Jest.")).toBeVisible();
    expect(
      screen.getByText("Deploys the desktop build on Fridays."),
    ).toBeVisible();
    expect(screen.getByText("testing")).toBeVisible();
    expect(screen.getByText("tooling")).toBeVisible();
    expect(screen.getByText("2 saved")).toBeVisible();
    expect(screen.getByText(/from “Testing setup”/)).toBeVisible();
  });

  it("filters by text", async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText("Prefers Vitest over Jest.");
    await user.type(screen.getByLabelText("Filter memories"), "fridays");
    expect(screen.queryByText("Prefers Vitest over Jest.")).toBeNull();
    expect(
      screen.getByText("Deploys the desktop build on Fridays."),
    ).toBeVisible();
  });

  it("filters by type", async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText("Prefers Vitest over Jest.");
    await user.click(screen.getByRole("button", { name: "project" }));
    expect(screen.queryByText("Prefers Vitest over Jest.")).toBeNull();
    expect(
      screen.getByText("Deploys the desktop build on Fridays."),
    ).toBeVisible();
  });

  it("deletes only after the confirm step", async () => {
    const user = userEvent.setup();
    rpcDeleteMemory.mockResolvedValue(memory as never);
    renderSettings();
    await screen.findByText("Prefers Vitest over Jest.");

    await user.click(
      screen.getByRole("button", { name: "Delete memory prefers-vitest" }),
    );
    expect(rpcDeleteMemory).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(rpcDeleteMemory).toHaveBeenCalledWith({ id: 3 });
    await waitFor(() => {
      expect(screen.queryByText("Prefers Vitest over Jest.")).toBeNull();
    });
    expect(
      screen.getByText("Deploys the desktop build on Fridays."),
    ).toBeVisible();
  });

  it("saves an edited memory with split topics", async () => {
    const user = userEvent.setup();
    rpcUpdateMemory.mockResolvedValue({
      ...memory,
      content: "Prefers Vitest everywhere.",
      topics: ["testing"],
    } as never);
    renderSettings();
    await screen.findByText("Prefers Vitest over Jest.");

    await user.click(
      screen.getByRole("button", { name: "Edit memory prefers-vitest" }),
    );
    const box = screen.getByLabelText("Memory content");
    await user.clear(box);
    await user.type(box, "Prefers Vitest everywhere.");
    const topics = screen.getByLabelText("Memory topics");
    await user.clear(topics);
    await user.type(topics, "testing, ");
    await user.click(screen.getByRole("button", { name: "Save memory" }));

    expect(rpcUpdateMemory).toHaveBeenCalledWith({
      id: 3,
      content: "Prefers Vitest everywhere.",
      topics: ["testing"],
    });
    expect(await screen.findByText("Prefers Vitest everywhere.")).toBeVisible();
  });

  it("explains itself when nothing is saved", async () => {
    rpcListMemories.mockResolvedValue([] as never);
    renderSettings();
    expect(await screen.findByText(/Nothing saved yet/)).toBeVisible();
  });
});
