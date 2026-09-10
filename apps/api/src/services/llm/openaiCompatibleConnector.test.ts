import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleConnector } from "./openaiCompatibleConnector.js";

const h = vi.hoisted(() => ({
  bodies: [] as Record<string, unknown>[],
  responses: [] as { status: number; body: string }[],
}));

vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: string | URL, init?: RequestInit) => {
    h.bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const scripted = h.bodies && h.responses.shift();
    if (scripted) {
      return new Response(scripted.body, {
        status: scripted.status,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }),
);

afterEach(() => {
  h.bodies.length = 0;
  h.responses.length = 0;
});

const connector = createOpenAiCompatibleConnector({
  baseUrl: "http://127.0.0.1:7777/v1",
  apiKey: "k",
  provider: "omlx",
  source: "local",
});

const sse = (frames: unknown[]) =>
  frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") +
  "data: [DONE]\n\n";

const req = {
  model: "m",
  messages: [{ role: "user", content: "hi" }],
};

describe("openaiCompatibleConnector think mapping", () => {
  const streamThink = async (think?: unknown) => {
    const handle = connector.stream(
      { ...req, ...(think !== undefined ? { think } : {}) } as never,
      () => undefined,
      new AbortController().signal,
    );
    await handle.done;
    return (h.bodies.at(-1) as { chat_template_kwargs?: unknown })
      .chat_template_kwargs;
  };

  it("maps think levels to chat_template_kwargs with reasoning_effort", async () => {
    h.responses.push({
      status: 200,
      body: sse([{ choices: [{ delta: { content: "x" } }] }]),
    });
    expect(await streamThink("medium")).toEqual({
      enable_thinking: true,
      reasoning_effort: "medium",
    });
    expect(await streamThink(true)).toEqual({ enable_thinking: true });
    // "high" maps onto oMLX's top knob "max".
    expect(await streamThink("high")).toEqual({
      enable_thinking: true,
      reasoning_effort: "max",
    });
  });

  it("maps think off/false to enable_thinking:false, which wins over any effort", async () => {
    expect(await streamThink("off")).toEqual({ enable_thinking: false });
    expect(await streamThink(false)).toEqual({ enable_thinking: false });
  });

  it("omits the kwargs entirely when think is not set", async () => {
    expect(await streamThink()).toBeUndefined();
  });
});

describe("openaiCompatibleConnector stream usage", () => {
  it("requests include_usage and adopts the final usage frame", async () => {
    h.responses.push({
      status: 200,
      body: sse([
        { choices: [{ delta: { content: "hey" } }] },
        { choices: [], usage: { prompt_tokens: 1234, completion_tokens: 21 } },
      ]),
    });
    const handle = connector.stream(
      req,
      () => undefined,
      new AbortController().signal,
    );
    const usage = await handle.done;
    expect(usage).toEqual({ promptTokens: 1234, evalTokens: 21 });
    expect(
      (h.bodies[0] as { stream_options?: unknown }).stream_options,
    ).toEqual({
      include_usage: true,
    });
  });

  it("returns null usage when the server never reports counts", async () => {
    h.responses.push({
      status: 200,
      body: sse([{ choices: [{ delta: { content: "plain" } }] }]),
    });
    const handle = connector.stream(
      req,
      () => undefined,
      new AbortController().signal,
    );
    await expect(handle.done).resolves.toBeNull();
  });
});

describe("openaiCompatibleConnector streamed tool calls", () => {
  const toolCallSse = (frames: unknown[]) =>
    frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") +
    "data: [DONE]\n\n";

  const collectToolCalls = async (body: string) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    const c = createOpenAiCompatibleConnector({
      baseUrl: "http://x/v1",
      apiKey: "",
      provider: "omlx",
    });
    const collected: unknown[] = [];
    const h = c.stream(
      { model: "m", messages: [] },
      (chunk) => {
        if (chunk.toolCalls?.length) collected.push(...chunk.toolCalls);
      },
      new AbortController().signal,
    );
    await h.done;
    return collected;
  };

  it("emits one tool call when arguments arrive in fragments", async () => {
    const collected = await collectToolCalls(
      toolCallSse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "c1",
                    function: { name: "bash", arguments: '{"comm' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: 'and":"rm -rf x"}' } },
                ],
              },
            },
          ],
        },
        {
          choices: [{ delta: { content: "" } }],
          usage: { prompt_tokens: 5, completion_tokens: 2 },
        },
      ]),
    );
    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({
      id: "c1",
      function: { name: "bash", arguments: { command: "rm -rf x" } },
    });
  });

  it("emits multiple distinct tool calls keyed by index", async () => {
    const collected = await collectToolCalls(
      toolCallSse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "a",
                    function: { name: "bash", arguments: '{"command":"ls"}' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 1,
                    id: "b",
                    function: { name: "list", arguments: '{"path":"~"}' },
                  },
                ],
              },
            },
          ],
        },
      ]),
    );
    expect(collected).toHaveLength(2);
    expect(
      collected.map((t) => (t as { function: { name: string } }).function.name),
    ).toEqual(["bash", "list"]);
  });
});
