import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ModelListing } from "@kotys/contracts";

vi.mock(
  "@kotys/client",
  async () => await import("../../../test/mocks/client"),
);
const { rpc, initTestClients } = await import("../../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../../test/platform");
const { useAppStore } = await import("@kotys/core");
const { SummaryModel } = await import("./SummaryModel");

const listing = (
  name: string,
  source: "cloud" | "local",
  provider = "ollama",
): ModelListing => ({
  name,
  contextLength: null,
  capabilities: [],
  source,
  provider,
});

const FAST = listing("deepseek-v4.1-flash", "cloud");
const LOCAL = listing("gemma4:31b", "local");

const renderSummary = () =>
  render(
    <KotysProviderForTest>
      <SummaryModel />
    </KotysProviderForTest>,
  );

const summarySetting = () =>
  vi
    .mocked(rpc.settings.set)
    .mock.calls.map(([input]) => input as { key: string; value: string })
    .filter((input) => input.key === "tts_summary_model");

const optionLabels = () =>
  screen.getAllByRole("option").map((o) => o.textContent);

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  useAppStore.setState({ modelsCache: [], ttsSummaryModel: null });
  vi.mocked(rpc.models.list).mockResolvedValue([FAST, LOCAL]);
});

describe("SummaryModel", () => {
  it("lists the chat models with where they run", async () => {
    renderSummary();

    expect(
      await screen.findByRole("option", {
        name: "deepseek-v4.1-flash (cloud)",
      }),
    ).toBeInTheDocument();
    expect(optionLabels()).toEqual([
      "None",
      "deepseek-v4.1-flash (cloud)",
      "gemma4:31b (local)",
    ]);
    expect(screen.getByRole("combobox", { name: "Summary model" })).toHaveValue(
      "",
    );
  });

  it("saves the chosen model", async () => {
    renderSummary();
    await screen.findByRole("option", { name: "gemma4:31b (local)" });
    await userEvent.selectOptions(
      screen.getByRole("combobox"),
      "gemma4:31b (local)",
    );

    expect(useAppStore.getState().ttsSummaryModel).toEqual(LOCAL);
    expect(summarySetting()).toEqual([
      { key: "tts_summary_model", value: JSON.stringify(LOCAL) },
    ]);
  });

  it("turns summaries off with None", async () => {
    useAppStore.setState({ ttsSummaryModel: FAST });
    renderSummary();
    await screen.findByRole("option", { name: "gemma4:31b (local)" });
    await userEvent.selectOptions(screen.getByRole("combobox"), "None");

    expect(useAppStore.getState().ttsSummaryModel).toBeNull();
    expect(summarySetting()).toEqual([{ key: "tts_summary_model", value: "" }]);
  });

  it("keeps a model that is no longer listed so it can be turned off", async () => {
    useAppStore.setState({ ttsSummaryModel: listing("old-model", "cloud") });
    renderSummary();
    await screen.findByRole("option", { name: "gemma4:31b (local)" });

    expect(screen.getByRole("combobox")).toHaveValue("ollama:cloud:old-model");
    expect(optionLabels()).toContain("old-model (cloud) (unavailable)");
  });
});
