import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => string | null>(() => null),
  supportsStreaming: vi.fn<(model: string) => Promise<boolean>>(),
  resolveSttConnector: vi.fn(),
}));

vi.mock("@kotys/db", () => ({ getSetting: mocks.getSetting }));

vi.mock("../services/stt/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/stt/registry.js")>()),
  resolveSttConnector: mocks.resolveSttConnector,
}));

import { sttRouter } from "./stt.js";

const capabilities = sttRouter.capabilities.callable({
  context: { clientId: null },
}) as unknown as () => Promise<{ streaming: boolean }>;

describe("stt.capabilities", () => {
  beforeEach(() => {
    mocks.getSetting.mockImplementation((key) =>
      key === "stt_model" ? "omlx:whisper-large-v3-turbo" : null,
    );
    mocks.supportsStreaming.mockReset();
    mocks.resolveSttConnector.mockReset();
    mocks.resolveSttConnector.mockReturnValue({
      supportsStreaming: mocks.supportsStreaming,
    });
  });

  it("asks the provider about the selected model", async () => {
    mocks.supportsStreaming.mockResolvedValue(true);

    await expect(capabilities()).resolves.toEqual({ streaming: true });
    expect(mocks.resolveSttConnector).toHaveBeenCalledWith({
      provider: "omlx",
      model: "whisper-large-v3-turbo",
    });
    expect(mocks.supportsStreaming).toHaveBeenCalledWith(
      "whisper-large-v3-turbo",
    );
  });

  it("does not stream without a model or a provider that can", async () => {
    mocks.getSetting.mockReturnValue(null);
    await expect(capabilities()).resolves.toEqual({ streaming: false });

    mocks.getSetting.mockReturnValue("omlx:parakeet");
    mocks.resolveSttConnector.mockReturnValue({});
    await expect(capabilities()).resolves.toEqual({ streaming: false });

    mocks.resolveSttConnector.mockImplementation(() => {
      throw new Error("oMLX is disabled");
    });
    await expect(capabilities()).resolves.toEqual({ streaming: false });
  });
});
