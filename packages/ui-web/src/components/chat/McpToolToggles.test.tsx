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

const McpSettings = (await import("../settings/McpSettings")).default;

const rpcMcpServers = rpc.mcp.servers as MockedFunction<typeof rpc.mcp.servers>;
const rpcSettingsGet = rpc.settings.get as MockedFunction<
  typeof rpc.settings.get
>;
const rpcSettingsSet = rpc.settings.set as MockedFunction<
  typeof rpc.settings.set
>;

const MCP_CONFIG = JSON.stringify({
  slack: { type: "http", url: "https://mcp.slack.com/mcp" },
});

const openMcpPanel = async () => {
  render(
    <KotysProvider>
      <McpSettings />
    </KotysProvider>,
  );
  await waitFor(() => expect(screen.getByText("slack")).toBeInTheDocument());
};

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  rpcSettingsGet.mockImplementation(async ({ key }: { key: string }) => ({
    key,
    value: key === "mcp_servers" ? MCP_CONFIG : null,
  }));
  rpcMcpServers.mockResolvedValue([
    {
      name: "slack",
      status: "connected",
      tools: [
        { name: "slack_send_message", description: "Send a message" },
        { name: "slack_read_channel", description: "Read a channel" },
      ],
    },
  ] as never);
});

describe("MCP tool toggles", () => {
  it("lists a server's tools with an enabled count", async () => {
    await openMcpPanel();
    // Expand the server's tools details
    await userEvent.click(screen.getByText(/tools enabled/));
    expect(screen.getByText(/2\s*\/\s*2 tools enabled/)).toBeInTheDocument();
    expect(screen.getByText("slack_send_message")).toBeInTheDocument();
  });

  it("persists a disabled MCP tool to tools_enabled", async () => {
    await openMcpPanel();
    await userEvent.click(screen.getByText(/tools enabled/));
    await userEvent.click(
      screen.getByRole("switch", { name: "Toggle slack_send_message" }),
    );
    await waitFor(() =>
      expect(rpcSettingsSet).toHaveBeenCalledWith({
        key: "tools_enabled",
        value: JSON.stringify({ slack_send_message: false }),
      }),
    );
    expect(screen.getByText(/1\s*\/\s*2 tools enabled/)).toBeInTheDocument();
  });

  it("reflects an already-disabled tool from the stored map", async () => {
    rpcSettingsGet.mockImplementation(async ({ key }: { key: string }) => ({
      key,
      value:
        key === "mcp_servers"
          ? MCP_CONFIG
          : JSON.stringify({ slack_read_channel: false }),
    }));
    await openMcpPanel();
    await userEvent.click(screen.getByText(/tools enabled/));
    expect(
      screen.getByRole("switch", { name: "Toggle slack_read_channel" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("switch", { name: "Toggle slack_send_message" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
