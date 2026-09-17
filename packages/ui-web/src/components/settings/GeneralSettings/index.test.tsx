import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock(
  "@kotys/client",
  async () => await import("../../../test/mocks/client"),
);
const { rpc, initTestClients } = await import("../../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../../test/platform");
const { useAppStore } = await import("@kotys/core");
const GeneralSettings = (await import(".")).default;

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  useAppStore.setState({ omlxEnabled: true, omlxApiKey: "" });
});

describe("GeneralSettings oMLX key", () => {
  it("saves the whole key as it is typed", async () => {
    render(
      <KotysProviderForTest>
        <GeneralSettings theme="system" onThemeChange={() => {}} />
      </KotysProviderForTest>,
    );
    await userEvent.type(screen.getByLabelText("oMLX API key"), "sk-secret");
    const saved = vi
      .mocked(rpc.settings.set)
      .mock.calls.map(([arg]) => arg)
      .filter((arg) => arg.key === "omlx_api_key")
      .map((arg) => arg.value);
    expect(saved.at(-1)).toBe("sk-secret");
    expect(screen.getByLabelText("oMLX API key")).toHaveValue("sk-secret");
  });
});
