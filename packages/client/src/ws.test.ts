import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KotysSocket } from "./ws.js";

/**
 * Heartbeat + status are what keep a phone's chat in sync after the OS froze
 * the socket: a half-open connection is detected and reconnected instead of
 * waiting forever, sends made offline are parked and flushed on reconnect,
 * and consumers learn about drops/regains.
 */

type FakeSocket = {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  readyState: number;
  sent: string[];
  close: () => void;
  send: (data: string) => void;
  /** Complete the handshake, like a real socket. */
  open: () => void;
};

let lastSocket: FakeSocket | null = null;

const installFakeWebSocket = () => {
  class FakeWebSocket implements FakeSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    readyState = FakeWebSocket.CONNECTING;
    sent: string[] = [];
    constructor(_url: string) {
      lastSocket = this as FakeSocket;
    }
    /** Complete the handshake, like a real socket. */
    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
      queueMicrotask(() => this.onclose?.());
    }
  }
  vi.stubGlobal("WebSocket", FakeWebSocket);
};

const emit = (socket: FakeSocket, msg: unknown) => {
  socket.onmessage?.({ data: JSON.stringify(msg) });
};

const pong = (socket: FakeSocket) => emit(socket, { type: "pong" });

beforeEach(() => {
  vi.useFakeTimers();
  installFakeWebSocket();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const newSocket = () => new KotysSocket({ baseUrl: "http://test", token: "t" });

/** Open the current socket and answer every ping, like a live peer. */
const openLive = (socket: KotysSocket) => {
  socket.connect();
  const ws = lastSocket!;
  ws.open();
  return ws;
};

describe("KotysSocket status", () => {
  it("starts connecting, then reports connected on open", () => {
    const socket = newSocket();
    const statuses: string[] = [];
    socket.onStatus((s) => statuses.push(s));
    socket.connect();
    expect(statuses).toEqual(["connecting"]);
    lastSocket!.open();
    expect(statuses).toEqual(["connecting", "connected"]);
    socket.close();
  });

  it("reports disconnected on close, then reconnects via backoff", () => {
    const socket = newSocket();
    const statuses: string[] = [];
    socket.onStatus((s) => statuses.push(s));
    socket.connect();
    lastSocket!.open();
    lastSocket!.onclose?.();
    vi.advanceTimersByTime(500);
    expect(statuses).toEqual([
      "connecting",
      "connected",
      "disconnected",
      "connecting",
    ]);
    socket.close();
  });
});

describe("KotysSocket heartbeat", () => {
  it("sends pings on an interval", () => {
    const socket = newSocket();
    const ws = openLive(socket);
    vi.advanceTimersByTime(15_000);
    expect(ws.sent).toContain(JSON.stringify({ type: "ping" }));
    socket.close();
  });

  it("closes a socket that never answers pings", () => {
    const socket = newSocket();
    const ws = openLive(socket);
    // Ticks at 15s and 30s; by the second tick lastPongAt is 30s old, past
    // the 25s silence timeout, so the socket is torn down and onclose
    // schedules a real reconnect.
    vi.advanceTimersByTime(30_000);
    expect(ws.readyState).toBe(3);
    socket.close();
  });

  it("keeps a socket that answers pongs", () => {
    const socket = newSocket();
    const ws = openLive(socket);
    vi.advanceTimersByTime(15_000);
    pong(ws);
    vi.advanceTimersByTime(15_000);
    pong(ws);
    expect(ws.readyState).toBe(1);
    socket.close();
  });
});

describe("KotysSocket wake", () => {
  it("keeps a freshly-proven socket without reconnecting", () => {
    const socket = newSocket();
    const ws = openLive(socket);
    vi.advanceTimersByTime(5_000);
    pong(ws);
    socket.wake();
    // No reconnect: same socket, still open.
    expect(lastSocket).toBe(ws);
    expect(ws.readyState).toBe(1);
    socket.close();
  });

  it("reconnects immediately around a stale OPEN socket", () => {
    const socket = newSocket();
    const ws = openLive(socket);
    // Silence past the freshness window: cellular NAT dropped it while
    // backgrounded. wake() must not wait for a probe round-trip.
    vi.advanceTimersByTime(30_000);
    socket.wake();
    expect(ws.readyState).toBe(3);
    expect(lastSocket).not.toBe(ws);
    socket.close();
  });

  it("abandons a hung CONNECTING attempt on wake", () => {
    const socket = newSocket();
    socket.connect();
    const hung = lastSocket!;
    hung.readyState = 0; // CONNECTING
    socket.wake();
    // A new attempt starts without waiting for the old one.
    expect(lastSocket).not.toBe(hung);
    socket.close();
  });

  it("reconnects immediately when the socket is not open", () => {
    const socket = newSocket();
    socket.connect();
    const first = lastSocket!;
    first.open();
    first.onclose?.();
    // Backoff had 500ms left; wake() must connect without waiting for it.
    socket.wake();
    expect(lastSocket!).not.toBe(first);
    socket.close();
  });
});

describe("KotysSocket connect timeout", () => {
  it("abandons an attempt stuck in CONNECTING and retries", () => {
    const socket = newSocket();
    socket.connect();
    const stuck = lastSocket!;
    vi.advanceTimersByTime(8_000);
    expect(stuck.readyState).toBe(3);
    // Backoff reconnect fires 500ms later.
    vi.advanceTimersByTime(500);
    expect(lastSocket).not.toBe(stuck);
    socket.close();
  });

  it("does not kill a connection that opened in time", () => {
    const socket = newSocket();
    socket.connect();
    const ws = lastSocket!;
    ws.open();
    // Answer every heartbeat: four full cycles past the connect timeout.
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(15_000);
      pong(ws);
    }
    expect(ws.readyState).toBe(1);
    socket.close();
  });
});

describe("KotysSocket send queue", () => {
  it("parks sends made while offline and flushes on reconnect", () => {
    const socket = newSocket();
    socket.connect();
    const first = lastSocket!;
    first.open();
    first.onclose?.();
    const ok = socket.send({ type: "chat:abort", payload: { requestId: 7 } });
    expect(ok).toBe(false);
    socket.wake();
    const second = lastSocket!;
    second.open();
    expect(second.sent).toContain(
      JSON.stringify({ type: "chat:abort", payload: { requestId: 7 } }),
    );
    socket.close();
  });

  it("queues sends made before any connection opens", () => {
    const socket = newSocket();
    socket.connect();
    const queued = socket.send({
      type: "chat:abort",
      payload: { requestId: 1 },
    });
    expect(queued).toBe(false);
    lastSocket!.open();
    expect(lastSocket!.sent).toContain(
      JSON.stringify({ type: "chat:abort", payload: { requestId: 1 } }),
    );
    socket.close();
  });

  it("does not queue heartbeat noise (ping/resume)", () => {
    const socket = newSocket();
    socket.send({ type: "ping" });
    socket.send({
      type: "chat:resume",
      payload: { requestId: 1, lastSeq: 0 },
    });
    socket.connect();
    lastSocket!.open();
    // Never a stale ping, and no resume for a stream this client never saw.
    expect(lastSocket!.sent).not.toContain(JSON.stringify({ type: "ping" }));
    expect(lastSocket!.sent).toHaveLength(0);
  });

  it("does not park a chat:append — it targets one live turn", () => {
    const socket = newSocket();
    socket.send({
      type: "chat:append",
      payload: { requestId: 3, content: "stop, do X instead" },
    });
    socket.connect();
    lastSocket!.open();
    // Replayed after reconnect it would land after the turn ended; dropping
    // it lets the client queue drain the text as a normal message instead.
    expect(lastSocket!.sent).toHaveLength(0);
    socket.close();
  });

  it("caps the queue at MAX_QUEUE, dropping the oldest", () => {
    const socket = newSocket();
    for (let i = 0; i < 60; i++) {
      socket.send({ type: "chat:abort", payload: { requestId: i } });
    }
    socket.connect();
    lastSocket!.open();
    const aborts = lastSocket!.sent.filter((s) => s.includes("chat:abort"));
    expect(aborts).toHaveLength(50);
    expect(JSON.parse(aborts[0]).payload.requestId).toBe(10);
    expect(JSON.parse(aborts[49]).payload.requestId).toBe(59);
    socket.close();
  });
});

describe("KotysSocket resume", () => {
  it("resumes in-flight streams past lastSeq after reconnecting", () => {
    const socket = newSocket();
    socket.connect();
    const ws = lastSocket!;
    ws.open();
    emit(ws, {
      type: "chat:chunk",
      seq: 5,
      payload: { requestId: 42, thinkingDelta: "", contentDelta: "x" },
    });
    ws.onclose?.();
    vi.advanceTimersByTime(500);
    lastSocket!.open();
    expect(lastSocket!.sent).toContain(
      JSON.stringify({
        type: "chat:resume",
        payload: { requestId: 42, lastSeq: 5 },
      }),
    );
    socket.close();
  });
});

describe("KotysSocket abandon", () => {
  it("late events from an abandoned socket must not fire", () => {
    const socket = newSocket();
    socket.connect();
    const first = lastSocket!;
    socket.wake();
    // The old socket's close fires after wake replaced it.
    first.onclose?.();
    first.open();
    // A late reconnect timer from the first attempt would double-connect.
    vi.advanceTimersByTime(60_000);
    expect(lastSocket).not.toBe(first);
    socket.close();
  });
});
