import { describe, expect, it } from "vitest";
import type { ModelListing } from "@kotys/contracts";
import {
  audioModelChoice,
  audioModelOption,
  chatModelOption,
} from "./modelOptions.js";

const listing = (
  name: string,
  source: "cloud" | "local",
  provider?: string,
): ModelListing => ({
  name,
  contextLength: null,
  capabilities: [],
  source,
  ...(provider ? { provider } : {}),
});

describe("model options", () => {
  it("keys audio models by the provider-tagged setting", () => {
    expect(audioModelOption(listing("higgs", "local", "omlx"))).toEqual({
      key: "omlx:higgs",
      label: "higgs",
    });
    expect(audioModelOption(listing("kokoro", "local"))).toEqual({
      key: "omlx:kokoro",
      label: "kokoro",
    });
  });

  it("turns a stored audio setting back into its option", () => {
    expect(audioModelChoice("omlx:higgs")).toEqual({
      key: "omlx:higgs",
      label: "higgs",
    });
    expect(audioModelChoice(null)).toBeNull();
  });

  it("tells a cloud and a local chat model with the same name apart", () => {
    const cloud = chatModelOption(listing("gemma4:31b", "cloud"));
    const local = chatModelOption(listing("gemma4:31b", "local"));

    expect(cloud).toEqual({
      key: "ollama:cloud:gemma4:31b",
      label: "gemma4:31b (cloud)",
    });
    expect(local.key).not.toBe(cloud.key);
  });

  it("labels chat models the way the chat model picker badges them", () => {
    expect(chatModelOption(listing("gemma4:latest", "local"))).toEqual({
      key: "ollama:local:gemma4:latest",
      label: "gemma4:latest (local)",
    });
    expect(chatModelOption(listing("qwen", "local", "omlx"))).toEqual({
      key: "omlx:local:qwen",
      label: "qwen (omlx)",
    });
  });
});
