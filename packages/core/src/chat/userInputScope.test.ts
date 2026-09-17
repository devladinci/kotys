import { describe, expect, it } from "vitest";
import type { InputRequest } from "@kotys/contracts";
import { isInputForChat } from "./userInputScope.js";

const request = (chatId?: number): InputRequest => ({
  id: 1,
  title: "Pick one",
  fields: [],
  ...(chatId === undefined ? {} : { chatId }),
});

describe("isInputForChat", () => {
  it("is false without a request", () => {
    expect(isInputForChat(null, 7)).toBe(false);
  });

  it("belongs to the chat that asked", () => {
    expect(isInputForChat(request(7), 7)).toBe(true);
    expect(isInputForChat(request(7), 8)).toBe(false);
    expect(isInputForChat(request(7), null)).toBe(false);
  });

  it("shows a request with no chat everywhere, as before", () => {
    expect(isInputForChat(request(), 7)).toBe(true);
    expect(isInputForChat(request(), null)).toBe(true);
  });
});
