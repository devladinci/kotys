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
  useAppStore.setState({ webSearchProvider: "ollama", searxngUrl: "" });
});

describe("GeneralSettings web search provider", () => {
  it("saves searxng provider selection and url", async () => {
    render(
      <KotysProviderForTest>
        <GeneralSettings theme="system" onThemeChange={() => {}} />
      </KotysProviderForTest>,
    );

    await userEvent.selectOptions(
      screen.getByLabelText("Web search provider"),
      "searxng",
    );
    await userEvent.type(
      screen.getByLabelText("SearXNG instance URL"),
      "http://127.0.0.1:9888",
    );

    const saved = vi.mocked(rpc.settings.set).mock.calls.map(([arg]) => arg);
    expect(saved).toContainEqual({
      key: "web_search_provider",
      value: "searxng",
    });
    expect(saved).toContainEqual({
      key: "searxng_url",
      value: "http://127.0.0.1:9888",
    });
    expect(screen.getByLabelText("SearXNG instance URL")).toHaveValue(
      "http://127.0.0.1:9888",
    );
  });

  it("keeps ollama as the default and hides the url field behind pointer-events when inactive", async () => {
    render(
      <KotysProviderForTest>
        <GeneralSettings theme="system" onThemeChange={() => {}} />
      </KotysProviderForTest>,
    );

    expect(screen.getByLabelText("Web search provider")).toHaveValue("ollama");
    const urlInput = screen.getByLabelText("SearXNG instance URL");
    expect(urlInput.closest("div")).toHaveClass("pointer-events-none");
  });
});
