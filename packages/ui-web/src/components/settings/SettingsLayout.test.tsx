import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { rpc, initTestClients } = await import("../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../test/platform");
const { SettingsLayout } = await import("./SettingsLayout");

const Page = () => (
  <div>
    <textarea aria-label="Draft" />
    <button type="button">Plain button</button>
  </div>
);

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  vi.mocked(rpc.skills.list).mockResolvedValue([]);
  render(
    <KotysProviderForTest>
      <MemoryRouter initialEntries={["/settings/page"]}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route path="page" element={<Page />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </KotysProviderForTest>,
  );
});

describe("SettingsLayout Escape", () => {
  it("keeps Settings open while typing in a field", async () => {
    await userEvent.type(screen.getByLabelText("Draft"), "unsaved");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Draft")).toHaveValue("unsaved");
  });

  it("closes Settings from anywhere else", async () => {
    await userEvent.click(screen.getByText("Plain button"));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});
