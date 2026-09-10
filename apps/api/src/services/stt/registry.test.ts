import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => string | null>(),
}));

vi.mock("@kotys/db", () => ({
  getSetting: mocks.getSetting,
  setSetting: vi.fn(),
}));

const { resolveSttConnector, parseSttModelSetting } =
  await import("./registry.js");

describe("stt registry", () => {
  beforeEach(() => {
    mocks.getSetting.mockReset();
    mocks.getSetting.mockReturnValue(null);
  });

  it("parseSttModelSetting splits provider:model", () => {
    expect(parseSttModelSetting("omlx:parakeet")).toEqual({
      provider: "omlx",
      model: "parakeet",
    });
  });

  it("parseSttModelSetting treats bare names as legacy omlx", () => {
    expect(parseSttModelSetting("parakeet-tdt-0.6b-v3")).toEqual({
      provider: "omlx",
      model: "parakeet-tdt-0.6b-v3",
    });
    expect(parseSttModelSetting(null)).toBeNull();
    expect(parseSttModelSetting("")).toBeNull();
  });

  it("resolveSttConnector rejects unknown providers", () => {
    expect(() =>
      resolveSttConnector({ provider: "whisper-web", model: "base" }),
    ).toThrow("Unknown speech-to-text provider");
  });

  it("resolveSttConnector rejects omlx when disabled", () => {
    mocks.getSetting.mockImplementation((key) =>
      key === "omlx_enabled" ? "false" : null,
    );
    expect(() => resolveSttConnector({ provider: "omlx", model: "p" })).toThrow(
      "oMLX is disabled",
    );
  });

  it("resolveSttConnector builds an omlx connector when enabled", () => {
    mocks.getSetting.mockImplementation((key) =>
      key === "omlx_enabled"
        ? "true"
        : key === "omlx_host"
          ? "http://h/v1"
          : "",
    );
    const connector = resolveSttConnector({ provider: "omlx", model: "p" });
    expect(typeof connector.listModels).toBe("function");
    expect(typeof connector.transcribe).toBe("function");
  });
});
