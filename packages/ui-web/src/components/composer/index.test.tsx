import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { IDictationInput } from "@saystack/core";
import type { IUseWebDictationOptions } from "@saystack/react-web";

const voice = vi.hoisted(() => ({
  options: null as IUseWebDictationOptions | null,
}));

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
vi.mock("@saystack/react-web", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDictationAura: () => {},
  useWebDictation: (options: IUseWebDictationOptions) => {
    voice.options = options;
    return {
      state: "idle",
      isSupported: true,
      text: "",
      handlePressStart: () => {},
      handlePressEnd: () => {},
      handleCancel: () => {},
      readLevels: () => undefined,
    };
  },
}));
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

  it("the Send button sends even while the menu is open", async () => {
    const { onSend } = renderComposer();
    await type("/create-kotys-pr");
    await waitFor(() =>
      expect(screen.getByRole("listbox")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByLabelText("Send message"));
    expect(onSend).toHaveBeenCalledWith("/create-kotys-pr", []);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows no menu when no skill matches", async () => {
    renderComposer();
    await type("see /zzz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("sends a dictated message and keeps the typed draft", async () => {
    const { onSend } = renderComposer();
    await type("draft to keep");
    act(() => voice.options?.onText?.("dictated words"));
    expect(onSend).toHaveBeenCalledWith("dictated words", []);
    expect(composer()).toHaveTextContent("draft to keep");
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

describe("Composer dictation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await initTestClients();
    skillsList.mockResolvedValue([]);
    voice.options = null;
  });

  const input = async () => {
    await waitFor(() => expect(voice.options?.input).toBeDefined());
    return voice.options?.input as IDictationInput;
  };

  it("streams to the daemon with the app token and sends a transcript that did not stream", async () => {
    const { onSend } = renderComposer();
    await input();
    const realtimeUrl = voice.options?.realtime?.url;

    expect(voice.options?.endpoint).toBe(
      "http://test/voice/audio/transcriptions",
    );
    expect(
      typeof realtimeUrl === "function" ? realtimeUrl() : realtimeUrl,
    ).toBe("ws://test/voice/audio/transcriptions/realtime?token=");
    const headers = voice.options?.headers;
    expect(typeof headers === "function" ? headers() : headers).toEqual({
      Authorization: "Bearer ",
    });
    act(() => voice.options?.onText?.("dictated words"));
    expect(onSend).toHaveBeenCalledWith("dictated words", []);
  });

  it("writes live words into the draft while they are spoken", async () => {
    const { onSend } = renderComposer();
    await type("Note:");
    const dictation = await input();

    act(() => dictation.show("Buy milk"));
    expect(composer()).toHaveTextContent("Note: Buy milk");
    act(() => dictation.show("Buy milk and eggs"));
    expect(composer()).toHaveTextContent("Note: Buy milk and eggs");
    act(() => dictation.end("Buy milk and eggs."));

    expect(composer()).toHaveTextContent("Note: Buy milk and eggs.");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("takes the words back out when the recording is dropped", async () => {
    renderComposer();
    await type("Keep this");
    const dictation = await input();

    act(() => dictation.show("not this"));
    act(() => dictation.end(null));

    expect(composer()).toHaveTextContent(/^Keep this$/);
  });

  it("undoes a whole dictation in one step", async () => {
    renderComposer();
    await type("Draft");
    const dictation = await input();

    act(() => dictation.show("one"));
    act(() => dictation.show("one two"));
    act(() => dictation.end("one two three"));
    expect(composer()).toHaveTextContent("Draft one two three");

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(composer()).toHaveTextContent(/^Draft$/);
  });
});
