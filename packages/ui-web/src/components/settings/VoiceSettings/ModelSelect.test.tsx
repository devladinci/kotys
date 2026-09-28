import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ModelListing } from "@kotys/contracts";
import { ModelSelect } from "./ModelSelect";

const listing = (name: string, provider = "omlx"): ModelListing => ({
  name,
  contextLength: null,
  capabilities: ["tts"],
  source: "local",
  provider,
});

const renderSelect = (
  models: ModelListing[] | null,
  selected: string | null = null,
  loadError: string | null = null,
) => {
  const onChange = vi.fn();
  render(
    <ModelSelect
      label="Speech output model"
      models={models}
      loadError={loadError}
      selected={selected}
      emptyText="No models."
      onChange={onChange}
    />,
  );

  return onChange;
};

const optionLabels = () =>
  screen.getAllByRole("option").map((o) => o.textContent);

describe("ModelSelect", () => {
  it("shows loading until the list arrives", () => {
    renderSelect(null);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("explains an empty list when nothing is selected", () => {
    renderSelect([]);

    expect(screen.getByText("No models.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows the load error", () => {
    renderSelect(null, null, "oMLX is not reachable");

    expect(screen.getByText("oMLX is not reachable")).toBeInTheDocument();
  });

  it("stores the choice with the provider of the listing", async () => {
    const onChange = renderSelect([
      listing("higgs", "omlx"),
      listing("kokoro", "other"),
    ]);
    await userEvent.selectOptions(screen.getByRole("combobox"), "kokoro");

    expect(onChange).toHaveBeenCalledWith("other:kokoro");
  });

  it("clears the choice with None", async () => {
    const onChange = renderSelect([listing("higgs")], "omlx:higgs");
    await userEvent.selectOptions(screen.getByRole("combobox"), "");

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps a model that went away visible so it can be turned off", () => {
    renderSelect([], "omlx:higgs");

    expect(screen.getByRole("combobox")).toHaveValue("higgs");
    expect(optionLabels()).toEqual(["None", "higgs (unavailable)"]);
  });
});
