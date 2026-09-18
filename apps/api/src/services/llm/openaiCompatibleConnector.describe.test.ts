import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleConnector } from "./openaiCompatibleConnector.js";

const routes = vi.hoisted(() => new Map<string, () => Response>());

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string | URL) => {
    const route = routes.get(String(url));
    return route ? route() : new Response("not found", { status: 404 });
  }),
);

afterEach(() => {
  routes.clear();
});

const connector = createOpenAiCompatibleConnector({
  baseUrl: "http://127.0.0.1:7777/v1",
  apiKey: "k",
  provider: "omlx",
  source: "local",
});

const json = (body: unknown) => () => Response.json(body);

describe("openaiCompatibleConnector describeModel", () => {
  it("reads the window the server enforces, not the model's native one", async () => {
    routes.set(
      "http://127.0.0.1:7777/v1/models/status",
      json({
        models: [
          {
            id: "Qwen3.8-27B",
            engine_type: "vlm",
            max_context_window: 65_536,
            model_context_length: 262_144,
          },
          { id: "other", engine_type: "vlm", max_context_window: 8_192 },
        ],
      }),
    );

    const model = await connector.describeModel?.("Qwen3.8-27B");

    expect(model).toMatchObject({
      name: "Qwen3.8-27B",
      contextLength: 65_536,
      provider: "omlx",
      source: "local",
    });
  });

  it("falls back to /models when the server has no status endpoint", async () => {
    routes.set(
      "http://127.0.0.1:7777/v1/models",
      json({ data: [{ id: "m", max_model_len: 40_960 }] }),
    );

    const model = await connector.describeModel?.("m");

    expect(model?.contextLength).toBe(40_960);
  });

  it("returns null for a model the server no longer lists", async () => {
    routes.set(
      "http://127.0.0.1:7777/v1/models/status",
      json({ models: [{ id: "hidden", is_hidden: true }] }),
    );

    expect(await connector.describeModel?.("hidden")).toBeNull();
    expect(await connector.describeModel?.("gone")).toBeNull();
  });
});
