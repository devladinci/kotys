import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const handlers = new Map<string, (msg: unknown) => void>();
const sent: unknown[] = [];

vi.mock("../shared/clients.js", () => ({
  getSocket: () => ({
    on: (cb: (msg: unknown) => void) => {
      handlers.set("on", cb);
    },
    send: (msg: unknown) => void sent.push(msg),
  }),
}));

const { useUserInput, useUserInputStore, subscribeUserInput } =
  await import("./useUserInput.js");

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

const emit = (msg: unknown) => handlers.get("on")!(msg);

describe("useUserInput", () => {
  beforeEach(() => {
    sent.length = 0;
    // subscribeUserInput registers once (module guard); keep the handler map.
    subscribeUserInput();
    useUserInputStore.setState({ pending: null });
  });

  it("an input:request stores the pending form", () => {
    emit({ type: "input:request", payload: REQUEST });
    expect(useUserInputStore.getState().pending).toEqual(REQUEST);
  });

  it("input:cancel clears the pending request with a matching id", () => {
    emit({ type: "input:request", payload: REQUEST });
    emit({ type: "input:cancel", payload: { id: 1 } });
    expect(useUserInputStore.getState().pending).toBeNull();
  });

  it("a cancel for a different id leaves the pending request alone", () => {
    emit({ type: "input:request", payload: REQUEST });
    emit({ type: "input:cancel", payload: { id: 99 } });
    expect(useUserInputStore.getState().pending?.id).toBe(1);
  });

  it("submit sends the answers over the socket and clears pending", () => {
    emit({ type: "input:request", payload: REQUEST });
    const { result } = renderHook(() => useUserInput());
    act(() => result.current.submit({ answer: "B" }));
    expect(sent).toEqual([
      { type: "input:response", payload: { id: 1, answers: { answer: "B" } } },
    ]);
    expect(useUserInputStore.getState().pending).toBeNull();
  });

  it("cancel sends cancelled:true and clears pending", () => {
    emit({ type: "input:request", payload: REQUEST });
    const { result } = renderHook(() => useUserInput());
    act(() => result.current.cancel());
    expect(sent).toEqual([
      { type: "input:response", payload: { id: 1, cancelled: true } },
    ]);
    expect(useUserInputStore.getState().pending).toBeNull();
  });

  it("submit with no pending request is a no-op", () => {
    const { result } = renderHook(() => useUserInput());
    act(() => result.current.submit({ answer: "B" }));
    expect(sent).toHaveLength(0);
  });
});
