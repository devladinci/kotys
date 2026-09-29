import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AddressInfo } from "node:net";
import type { SttStreamEvent } from "./services/stt/types.js";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => string | null>(() => null),
  setSetting: vi.fn<() => void>(),
}));

vi.mock("@kotys/db", () => ({
  DB_PATH: "/tmp/kotys-stt-stream-test/chat.db",
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}));

type OpenStreamArgs = [
  { model: string; language?: string },
  (event: SttStreamEvent) => void,
];

const upstream = {
  audio: [] as number[],
  stopped: false,
  closed: false,
  report: (_event: SttStreamEvent) => {},
};

const openStreamMock = vi.fn((...[, onEvent]: OpenStreamArgs) => {
  upstream.report = onEvent;
  return {
    send: (pcm: Uint8Array) => upstream.audio.push(pcm.byteLength),
    stop: () => {
      upstream.stopped = true;
    },
    close: () => {
      upstream.closed = true;
    },
  };
});

const connector = {
  listModels: vi.fn(),
  transcribe: vi.fn(),
  openStream: openStreamMock as
    ((...args: OpenStreamArgs) => unknown) | undefined,
};

vi.mock("./services/stt/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/stt/registry.js")>()),
  resolveSttConnector: vi.fn(() => connector),
}));

import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { WebSocket, WebSocketServer } from "ws";
import { registerSttStreamRoute } from "./sttStreamRoute.js";

const APP_TOKEN = "t".repeat(64);

let server: ServerType;
let base = "";

beforeAll(async () => {
  const app = new Hono();
  registerSttStreamRoute(app);
  const wss = new WebSocketServer({ noServer: true });
  await new Promise<void>((resolve) => {
    server = serve(
      {
        fetch: app.fetch,
        hostname: "127.0.0.1",
        port: 0,
        websocket: { server: wss },
      },
      () => resolve(),
    );
  });
  base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  mocks.getSetting.mockImplementation((key) =>
    key === "api_token"
      ? APP_TOKEN
      : key === "stt_model"
        ? "omlx:whisper-large-v3-turbo"
        : null,
  );
  openStreamMock.mockClear();
  connector.openStream = openStreamMock;
  upstream.audio = [];
  upstream.stopped = false;
  upstream.closed = false;
});

type Heard = { messages: Record<string, unknown>[]; closed: Promise<number> };

const connect = async (token = APP_TOKEN) => {
  const ws = new WebSocket(`${base}/stt/stream?token=${token}`);
  const heard: Heard = {
    messages: [],
    closed: new Promise((resolve) => ws.on("close", (code) => resolve(code))),
  };
  ws.on("message", (data) => {
    heard.messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
  });
  await new Promise((resolve) => ws.on("open", resolve));
  return { ws, heard };
};

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("/stt/stream", () => {
  it("rejects a connection without the app token", async () => {
    const { heard } = await connect("nope");
    expect(await heard.closed).toBe(4001);
    expect(openStreamMock).not.toHaveBeenCalled();
  });

  it("relays audio up and the transcript down, on the selected model", async () => {
    const { ws, heard } = await connect();
    ws.send(JSON.stringify({ type: "start", language: "en" }));
    await until(() => openStreamMock.mock.calls.length > 0);
    expect(openStreamMock.mock.calls[0]?.[0]).toEqual({
      model: "whisper-large-v3-turbo",
      language: "en",
    });

    upstream.report({ type: "ready" });
    ws.send(new Uint8Array(3200));
    ws.send(new Uint8Array(1600));
    upstream.report({ type: "delta", text: " Hello" });
    await until(
      () => upstream.audio.length === 2 && heard.messages.length === 2,
    );
    ws.send(JSON.stringify({ type: "stop" }));
    await until(() => upstream.stopped);
    upstream.report({ type: "done", text: " Hello" });

    expect(await heard.closed).toBe(1000);
    expect(upstream.audio).toEqual([3200, 1600]);
    expect(heard.messages).toEqual([
      { type: "ready" },
      { type: "transcript.delta", delta: " Hello" },
      { type: "transcript.done", text: " Hello" },
    ]);
    await until(() => upstream.closed);
    expect(upstream.closed).toBe(true);
  });

  it("passes the provider's refusal on, so the app can transcribe afterwards", async () => {
    const { ws, heard } = await connect();
    ws.send(JSON.stringify({ type: "start" }));
    await until(() => openStreamMock.mock.calls.length > 0);
    upstream.report({
      type: "error",
      message: "Model 'parakeet' does not support realtime transcription.",
    });

    expect(await heard.closed).toBe(1011);
    expect(heard.messages).toEqual([
      {
        type: "error",
        detail: "Model 'parakeet' does not support realtime transcription.",
      },
    ]);
  });

  it("says so when the provider cannot stream at all", async () => {
    connector.openStream = undefined;
    const { ws, heard } = await connect();
    ws.send(JSON.stringify({ type: "start" }));

    expect(await heard.closed).toBe(1011);
    expect(heard.messages[0]).toMatchObject({ type: "error" });
  });

  it("needs a selected model", async () => {
    mocks.getSetting.mockImplementation((key) =>
      key === "api_token" ? APP_TOKEN : null,
    );
    const { ws, heard } = await connect();
    ws.send(JSON.stringify({ type: "start" }));

    expect(await heard.closed).toBe(1011);
    expect(heard.messages).toEqual([
      { type: "error", detail: "No speech-to-text model selected" },
    ]);
    expect(openStreamMock).not.toHaveBeenCalled();
  });

  it("closes the provider's stream when the app hangs up", async () => {
    const { ws } = await connect();
    ws.send(JSON.stringify({ type: "start" }));
    await until(() => openStreamMock.mock.calls.length > 0);
    ws.close();
    await until(() => upstream.closed);

    expect(upstream.closed).toBe(true);
  });
});
