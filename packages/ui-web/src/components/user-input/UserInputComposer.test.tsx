import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { KotysProviderForTest } = await import("../../test/platform");

const { useUserInputStore } = await import("@kotys/core");
const UserInputComposer = (await import("./UserInputComposer")).default;

const REQUEST = {
  id: 1,
  title: "Which case is 'puellam'?",
  fields: [
    {
      id: "answer",
      kind: "choice" as const,
      options: [
        { value: "A", label: "Nominative" },
        { value: "B", label: "Accusative" },
      ],
    },
  ],
};

const renderComposer = () =>
  render(
    <KotysProviderForTest>
      <UserInputComposer />
    </KotysProviderForTest>,
  );

beforeEach(() => {
  useUserInputStore.setState({ pending: null });
});

describe("UserInputComposer", () => {
  it("renders nothing with no pending request", () => {
    const { container } = renderComposer();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the form when a request arrives", () => {
    useUserInputStore.setState({ pending: REQUEST });
    renderComposer();
    expect(screen.getByText("Which case is 'puellam'?")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Accusative" }),
    ).toBeInTheDocument();
  });

  it("submit clears the pending request", async () => {
    useUserInputStore.setState({ pending: REQUEST });
    renderComposer();
    await userEvent.click(screen.getByRole("radio", { name: "Accusative" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(useUserInputStore.getState().pending).toBeNull(),
    );
  });

  it("cancel clears the pending request", async () => {
    useUserInputStore.setState({ pending: REQUEST });
    renderComposer();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(useUserInputStore.getState().pending).toBeNull(),
    );
  });
});
