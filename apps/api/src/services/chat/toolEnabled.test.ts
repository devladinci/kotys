import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEnabledTools, TOOLS_ENABLED_KEY } from "./toolEnabled.js";

const mocks = vi.hoisted(() => ({ getSetting: vi.fn<() => string | null>() }));

vi.mock("@kotys/db", () => ({ getSetting: mocks.getSetting }));

beforeEach(() => {
  mocks.getSetting.mockReset();
  mocks.getSetting.mockReturnValue(null);
});

describe("getEnabledTools", () => {
  it("returns all-default (empty map) when the setting is unset", () => {
    expect(getEnabledTools()).toEqual({});
    expect(mocks.getSetting).toHaveBeenCalledWith(TOOLS_ENABLED_KEY);
  });

  it("parses a stored Record<string, boolean>", () => {
    mocks.getSetting.mockReturnValue('{"bash":false,"grep":true}');
    expect(getEnabledTools()).toEqual({ bash: false, grep: true });
  });

  it("treats corrupt JSON as all-default", () => {
    mocks.getSetting.mockReturnValue("{not json");
    expect(getEnabledTools()).toEqual({});
  });

  it("treats non-object JSON (array, scalar) as all-default", () => {
    mocks.getSetting.mockReturnValue("[true]");
    expect(getEnabledTools()).toEqual({});
    mocks.getSetting.mockReturnValue("42");
    expect(getEnabledTools()).toEqual({});
  });
});
