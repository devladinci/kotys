import { describe, expect, it } from "vitest";
import { parseTtsModelSetting, TTS_MODEL_SETTING } from "./registry.js";

describe("parseTtsModelSetting", () => {
  it("exposes the setting key", () => {
    expect(TTS_MODEL_SETTING).toBe("tts_model");
  });

  it("returns null for no selection", () => {
    expect(parseTtsModelSetting(null)).toBeNull();
    expect(parseTtsModelSetting("")).toBeNull();
  });

  it("splits provider:model", () => {
    expect(parseTtsModelSetting("omlx:higgs_audio_v3-tts-4b")).toEqual({
      provider: "omlx",
      model: "higgs_audio_v3-tts-4b",
    });
  });

  it("parses a bare legacy name as omlx", () => {
    expect(parseTtsModelSetting("higgs_audio_v3-tts-4b")).toEqual({
      provider: "omlx",
      model: "higgs_audio_v3-tts-4b",
    });
  });
});
