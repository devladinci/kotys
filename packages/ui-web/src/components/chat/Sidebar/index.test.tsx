import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Chat } from "@kotys/core";

vi.mock(
  "@kotys/client",
  async () => await import("../../../test/mocks/client"),
);
const Sidebar = (await import(".")).default;

const chat = {
  id: 1,
  title: "Old title",
  topics: ["work"],
  created_at: 0,
  updated_at: Math.floor(Date.now() / 1000),
} as unknown as Chat;

const onRenameChat = vi.fn();
const onSelectChat = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  render(
    <MemoryRouter>
      <Sidebar
        chats={[chat]}
        activeChatId={null}
        searchQuery=""
        searchResults={null}
        pinnedChatIds={new Set()}
        onCreateChat={vi.fn()}
        onSelectChat={onSelectChat}
        onDeleteChat={vi.fn()}
        onRenameChat={onRenameChat}
        onSearchChange={vi.fn()}
        onOpenSearchResult={vi.fn()}
        onTogglePinned={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenAnalytics={vi.fn()}
      />
    </MemoryRouter>,
  );
});

const startRename = async () => {
  await userEvent.click(screen.getByLabelText("Rename Old title"));
  const input = screen.getByLabelText("Rename chat");
  await userEvent.clear(input);
  return input;
};

describe("Sidebar rename", () => {
  it("accepts spaces and saves on Enter without opening the chat", async () => {
    const input = await startRename();
    await userEvent.type(input, "My new title{Enter}");
    expect(onRenameChat).toHaveBeenCalledTimes(1);
    expect(onRenameChat).toHaveBeenCalledWith(1, "My new title");
    expect(onSelectChat).not.toHaveBeenCalled();
  });

  it("cancels on Escape without saving", async () => {
    const input = await startRename();
    await userEvent.type(input, "Throwaway{Escape}");
    expect(onRenameChat).not.toHaveBeenCalled();
    expect(screen.getByText("Old title")).toBeInTheDocument();
  });

  it("saves when the field loses focus", async () => {
    const input = await startRename();
    await userEvent.type(input, "Kept");
    await userEvent.click(document.body);
    expect(onRenameChat).toHaveBeenCalledWith(1, "Kept");
  });
});

describe("Sidebar row keyboard", () => {
  it("opens the chat with Enter or Space on the row itself", async () => {
    const row = screen.getByText("Old title").closest('[role="button"]');
    (row as HTMLElement).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onSelectChat).toHaveBeenCalledTimes(2);
  });
});
