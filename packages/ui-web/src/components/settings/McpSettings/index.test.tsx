import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock(
  "@kotys/client",
  async () => await import("../../../test/mocks/client"),
);
const { rpc, initTestClients } = await import("../../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../../test/platform");
const McpSettings = (await import(".")).default;

const LINEAR = {
  type: "http",
  url: "https://mcp.linear.app/mcp",
  clientId: "abc",
  clientSecret: "shh",
  scope: "read write",
  headers: { Authorization: "Bearer token" },
};

const savedServers = (): Record<string, unknown> => {
  const calls = vi
    .mocked(rpc.settings.set)
    .mock.calls.map(([arg]) => arg)
    .filter((arg) => arg.key === "mcp_servers");
  return JSON.parse(calls.at(-1)?.value ?? "{}");
};

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  vi.mocked(rpc.settings.get).mockImplementation((async ({
    key,
  }: {
    key: string;
  }) => ({
    key,
    value:
      key === "mcp_servers"
        ? JSON.stringify({
            linear: LINEAR,
            files: { command: "npx", args: ["files"] },
          })
        : null,
  })) as never);
  vi.mocked(rpc.mcp.servers).mockResolvedValue([]);
  vi.mocked(rpc.mcp.reconnect).mockResolvedValue([]);
  render(
    <KotysProviderForTest>
      <McpSettings />
    </KotysProviderForTest>,
  );
  await waitFor(() => expect(screen.getByText("linear")).toBeInTheDocument());
});

describe("McpSettings saving", () => {
  it("keeps another server's headers, secret and scope", async () => {
    await userEvent.click(screen.getByLabelText("Remove files"));
    await waitFor(() => expect(savedServers()).toEqual({ linear: LINEAR }));
  });

  it("keeps the fields the form does not show when editing", async () => {
    await userEvent.click(screen.getByLabelText("Edit linear"));
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(savedServers().linear).toEqual(LINEAR));
  });
});
