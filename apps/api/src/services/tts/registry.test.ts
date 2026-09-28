import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => string | null>(),
}));

vi.mock("@kotys/db", () => ({
  getSetting: mocks.getSetting,
  setSetting: vi.fn(),
}));

const { listEnabledTtsConnectors, parseTtsModelSetting, resolveTtsConnector } =
  await import("./registry.js");

const enableOmlx = (isEnabled: boolean) =>
  mocks.getSetting.mockImplementation((key) =>
    key === "omlx_enabled" ? String(isEnabled) : null,
  );

describe("tts registry", () => {
  beforeEach(() => {
    mocks.getSetting.mockReset();
    mocks.getSetting.mockReturnValue(null);
  });

  it("parses provider:model and treats bare names as omlx", () => {
    expect(parseTtsModelSetting("omlx:higgs_audio_v3-tts-4b")).toEqual({
      provider: "omlx",
      model: "higgs_audio_v3-tts-4b",
    });
    expect(parseTtsModelSetting("kokoro")).toEqual({
      provider: "omlx",
      model: "kokoro",
    });
    expect(parseTtsModelSetting(null)).toBeNull();
    expect(parseTtsModelSetting("")).toBeNull();
  });

  it("rejects unknown providers", () => {
    expect(() =>
      resolveTtsConnector({ provider: "elevenlabs", model: "v2" }),
    ).toThrow("Unknown text-to-speech provider");
  });

  it("rejects omlx when it is disabled", () => {
    enableOmlx(false);
    expect(() => resolveTtsConnector({ provider: "omlx", model: "m" })).toThrow(
      "oMLX is disabled",
    );
    expect(listEnabledTtsConnectors()).toEqual([]);
  });

  it("builds an omlx connector when enabled", () => {
    enableOmlx(true);
    const connector = resolveTtsConnector({ provider: "omlx", model: "m" });
    expect(typeof connector.synthesize).toBe("function");
    expect(listEnabledTtsConnectors().map((c) => c.provider)).toEqual(["omlx"]);
  });
});
