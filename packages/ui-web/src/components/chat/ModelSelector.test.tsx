import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ModelListing } from "@kotys/contracts";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { initTestClients } = await import("../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../test/platform");
const { useAppStore } = await import("@kotys/core");
const ModelSelector = (await import("./ModelSelector")).default;

const model = (name: string): ModelListing => ({
  name,
  contextLength: 8192,
  capabilities: [],
  source: "cloud",
});

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  useAppStore.setState({ defaultModel: model("global-default") });
});

describe("ModelSelector", () => {
  it("shows the chat's model, not the global default", () => {
    render(
      <KotysProviderForTest>
        <ModelSelector model={model("chat-model")} />
      </KotysProviderForTest>,
    );
    expect(screen.getByLabelText("Select model")).toHaveTextContent(
      "chat-model",
    );
  });

  it("falls back to the default when no model is given", () => {
    render(
      <KotysProviderForTest>
        <ModelSelector />
      </KotysProviderForTest>,
    );
    expect(screen.getByLabelText("Select model")).toHaveTextContent(
      "global-default",
    );
  });
});
