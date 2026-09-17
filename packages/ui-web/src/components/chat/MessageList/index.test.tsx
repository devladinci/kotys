import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Message } from "@kotys/contracts";
import MessageList, { type IMessageListHandle } from ".";

const listProps = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock("react-window", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  List: (props: Record<string, unknown>) => {
    listProps.current = props;
    return <div data-testid="virtual-list" />;
  },
}));

const messages = (count: number): Message[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message ${i + 1}`,
    createdAt: 0,
  })) as Message[];

const noop = () => {};

const renderList = (count: number, ref?: React.Ref<IMessageListHandle>) => {
  const onAtBottomChange = vi.fn();
  render(
    <MessageList
      ref={ref}
      messages={messages(count)}
      streamingId={null}
      highlightId={null}
      compactUpto={0}
      onImageClick={noop}
      onAtBottomChange={onAtBottomChange}
    />,
  );
  return { onAtBottomChange };
};

beforeEach(() => {
  listProps.current = null;
});

describe("MessageList", () => {
  it("lets react-window measure rows instead of fixing their height", () => {
    renderList(201);
    expect(screen.getByTestId("virtual-list")).toBeInTheDocument();
    // A function here makes react-window skip measuring; the cache object is
    // what turns on per-row heights.
    expect(typeof listProps.current?.rowHeight).toBe("object");
    expect(listProps.current?.rowCount).toBe(201);
  });

  it("renders every message without the virtual list below the threshold", () => {
    renderList(3);
    expect(screen.queryByTestId("virtual-list")).not.toBeInTheDocument();
    expect(screen.getByText("message 3")).toBeInTheDocument();
  });

  it("reports when the newest message scrolls out of view", () => {
    const { onAtBottomChange } = renderList(3);
    const scroller = screen.getByText("message 3").closest("div.h-full");
    if (!scroller) throw new Error("no scroll container");
    Object.defineProperty(scroller, "scrollHeight", { value: 1000 });
    Object.defineProperty(scroller, "clientHeight", { value: 300 });
    Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true });

    fireEvent.scroll(scroller);
    expect(onAtBottomChange).toHaveBeenLastCalledWith(false);

    Object.defineProperty(scroller, "scrollTop", { value: 700 });
    fireEvent.scroll(scroller);
    expect(onAtBottomChange).toHaveBeenLastCalledWith(true);
  });

  it("scrolls to the newest message on request", () => {
    const ref = createRef<IMessageListHandle>();
    renderList(3, ref);
    const scroller = screen.getByText("message 3").closest("div.h-full");
    if (!scroller) throw new Error("no scroll container");
    Object.defineProperty(scroller, "scrollHeight", { value: 1000 });
    const scrollTo = vi.fn();
    (scroller as unknown as { scrollTo: unknown }).scrollTo = scrollTo;

    ref.current?.scrollToBottom(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
  });
});
