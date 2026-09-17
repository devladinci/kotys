import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { rpc, initTestClients } = await import("../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../test/platform");

const Composer = (await import("./index")).default;

const skillsList = rpc.skills.list as ReturnType<typeof vi.fn>;

const listing = {
  name: "create-kotys-pr",
  description: "Validate and create a Kotys PR",
  source: "user" as const,
  enabled: true,
  userInvocable: true,
  modelInvocable: true,
};

const renderComposer = () => {
  const onSend = vi.fn();
  render(
    <KotysProviderForTest>
      <Composer
        isApiKeyMissing={false}
        modelName="test-model"
        isVisionCapable={false}
        hasMessages={false}
        isLoading={false}
        streamingId={null}
        queuedMessages={[]}
        onSend={onSend}
        onAbort={() => {}}
        onDequeue={() => {}}
      />
    </KotysProviderForTest>,
  );
  return { onSend };
};

const composer = () => screen.getByLabelText("Message composer");
const type = async (text: string) => {
  await userEvent.type(composer(), text);
};

describe("Composer slash menu", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await initTestClients();
    skillsList.mockResolvedValue([listing]);
  });

  it("opens on a bare / and lists every user-invocable skill", async () => {
    renderComposer();
    await type("/");
    await waitFor(() =>
      expect(screen.getByRole("listbox")).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("keeps the typed text and sends normally after picking a skill", async () => {
    const { onSend } = renderComposer();
    await type("/");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { selected: true }),
      ).toBeInTheDocument(),
    );
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(composer()).toHaveTextContent("/create-kotys-pr"),
    );
    await type(" check the diff");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith("/create-kotys-pr check the diff", []);
    expect(composer().textContent).toBe("");
  });

  it("enter never re-picks a closed menu or sends twice", async () => {
    const { onSend } = renderComposer();
    await type("/");
    await waitFor(() =>
      expect(screen.getByRole("listbox")).toBeInTheDocument(),
    );
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(composer()).toHaveTextContent("/create-kotys-pr"),
    );
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("escape closes the menu and enter then sends the literal text", async () => {
    const { onSend } = renderComposer();
    await type("/create{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    await type(" and check CI");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("/create and check CI", []);
  });

  it("a second / after a pick reopens the menu for the next skill", async () => {
    renderComposer();
    await type("/");
    await waitFor(() =>
      expect(screen.getByRole("listbox")).toBeInTheDocument(),
    );
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(composer()).toHaveTextContent("/create-kotys-pr"),
    );
    await userEvent.clear(composer());
    await type("/");
    await waitFor(() =>
      expect(screen.getByRole("listbox")).toBeInTheDocument(),
    );
  });

  it("opens after other words and keeps them when a skill is picked", async () => {
    const { onSend } = renderComposer();
    await type("please /cre");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { selected: true }),
      ).toBeInTheDocument(),
    );
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(composer()).toHaveTextContent("please /create-kotys-pr"),
    );
    await type(" for this branch");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      "please /create-kotys-pr for this branch",
      [],
    );
  });

  it("stays closed for a slash inside a word or path", async () => {
    const { onSend } = renderComposer();
    await type("and/or");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await type(" see /usr/");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("and/or see /usr/", []);
  });

  it("hidden skills never appear in the menu", async () => {
    skillsList.mockResolvedValue([
      listing,
      { ...listing, name: "internal-only", userInvocable: false },
    ]);
    renderComposer();
    await type("/");
    await waitFor(() =>
      expect(screen.getByRole("listbox")).toBeInTheDocument(),
    );
    const names = screen
      .getAllByRole("option")
      .map((o) => o.textContent ?? "")
      .join(" ");
    expect(names).toContain("create-kotys-pr");
    expect(names).not.toContain("internal-only");
  });
});
