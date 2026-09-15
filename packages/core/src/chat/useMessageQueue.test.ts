import { describe, expect, it } from "vitest";
import { resetQueued } from "./queueStore.js";
import { useMessageQueue } from "./useMessageQueue.js";
import { renderHook } from "@testing-library/react";

describe("useMessageQueue", () => {
  it("keeps the null-chat snapshot referentially stable across renders", () => {
    resetQueued();
    const { result, rerender } = renderHook(() => useMessageQueue(null));
    const first = result.current.queuedMessages;
    rerender();
    expect(result.current.queuedMessages).toBe(first);
  });
});
