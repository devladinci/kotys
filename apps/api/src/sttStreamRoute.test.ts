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
import type { ISttRealtimeSession, ISttTranscribeResult } from "@saystack/core";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => string | null>(() => null),
  setSetting: vi.fn<() => void>(),
}));

vi.mock("@kotys/db", () => ({
  DB_PATH: "/tmp/kotys-stt-stream-test/chat.db",
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}));

const engine = {
  audio: [] as number[],
  isReleased: false,
  delta: (_text: string) => {},
  stopWith: (_result: ISttTranscribeResult) => {},
};

const session: ISttRealtimeSession = {
  capabilities: {
    streaming: true,
    interimResults: true,
    wordTimings: false,
    languages: [],
  },
  feedPcm16: (pcm) => engine.audio.push(pcm.byteLength),
  onDelta: (handler) => {
    engine.delta = (text) => handler(text, text);
  },
  onError: () => {},
  stop: () =>
    new Promise((resolve) => {
      engine.stopWith = resolve;
    }),
  release: () => {
    engine.isReleased = true;
  },
};

const connector = {
  listModels: vi.fn(),
  supportsStreaming: vi.fn(async () => true),
  openRealtime: vi.fn(async () => ({ ok: true as const, session })),
  transcribe: vi.fn(async (_req: { file: Blob; filename: string }) => ({
    text: "Buy milk and eggs.",
    language: null,
    duration: null,
  })),
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
  vi.clearAllMocks();
  connector.supportsStreaming.mockResolvedValue(true);
  engine.audio = [];
  engine.isReleased = false;
});

const connect = async (token = APP_TOKEN) => {
  const ws = new WebSocket(`${base}/stt/stream?token=${token}`);
  const messages: Record<string, unknown>[] = [];
  const closed = new Promise<number>((resolve) =>
    ws.on("close", (code) => resolve(code)),
  );
  ws.on("message", (data) => {
    messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
  });
  await new Promise((resolve) => ws.on("open", resolve));
  return { ws, messages, closed };
};

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("/stt/stream", () => {
  it("rejects a connection without the app token", async () => {
    const { closed } = await connect("nope");
    expect(await closed).toBe(4001);
    expect(connector.openRealtime).not.toHaveBeenCalled();
  });

  it("streams on the selected model and ends with one pass over the recording", async () => {
    const { ws, messages, closed } = await connect();
    ws.send(JSON.stringify({ type: "start", language: "en" }));
    await until(() => messages.length > 0);
    expect(connector.openRealtime).toHaveBeenCalledWith({
      model: "whisper-large-v3-turbo",
      language: "en",
    });

    ws.send(new Uint8Array(3200));
    engine.delta(" Buy milk");
    await until(() => engine.audio.length === 1 && messages.length === 2);
    ws.send(JSON.stringify({ type: "stop" }));
    await until(() => connector.transcribe.mock.calls.length > 0);
    engine.stopWith({ ok: true, text: " Buy milk. milk." });

    expect(await closed).toBe(1000);
    expect(messages).toEqual([
      { type: "ready" },
      { type: "transcript.delta", delta: " Buy milk" },
      { type: "transcript.done", text: "Buy milk and eggs." },
    ]);
    const file = connector.transcribe.mock.calls[0]?.[0].file;
    expect(file?.type).toBe("audio/wav");
    expect(file?.size).toBe(44 + 3200);
    await until(() => engine.isReleased);
    expect(engine.isReleased).toBe(true);
  });

  it("refuses at once when the model cannot stream, so the app transcribes instead", async () => {
    connector.supportsStreaming.mockResolvedValue(false);
    const { ws, messages, closed } = await connect();
    ws.send(JSON.stringify({ type: "start" }));

    expect(await closed).toBe(1011);
    expect(messages).toEqual([
      {
        type: "error",
        errorCode: "MODEL_NOT_FOUND",
        detail: "The selected speech-to-text model cannot transcribe live",
      },
    ]);
    expect(connector.openRealtime).not.toHaveBeenCalled();
  });

  it("needs a selected model", async () => {
    mocks.getSetting.mockImplementation((key) =>
      key === "api_token" ? APP_TOKEN : null,
    );
    const { ws, messages, closed } = await connect();
    ws.send(JSON.stringify({ type: "start" }));

    expect(await closed).toBe(1011);
    expect(messages[0]).toMatchObject({
      type: "error",
      detail: "No speech-to-text model selected",
    });
  });

  it("releases the engine when the app hangs up", async () => {
    const { ws, messages } = await connect();
    ws.send(JSON.stringify({ type: "start" }));
    await until(() => messages.length > 0);
    ws.close();
    await until(() => engine.isReleased);

    expect(engine.isReleased).toBe(true);
  });
});
