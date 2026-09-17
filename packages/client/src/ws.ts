import type { ClientMessage, ServerMessage } from "@kotys/api";
import type { KotysConfig, SocketOptions } from "./rpc.js";

export type { ClientMessage, ServerMessage };

type Listener = (msg: ServerMessage) => void;
export type SocketStatus = "connecting" | "connected" | "disconnected";

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 15_000;
/** How often a live socket is probed with a ping. */
const HEARTBEAT_MS = 15_000;
/** Silence past this means the TCP peer is gone even though readyState says OPEN. */
const SILENCE_TIMEOUT_MS = HEARTBEAT_MS + 10_000;
/** A connection attempt that has not opened by now is abandoned. */
const CONNECT_TIMEOUT_MS = 8_000;
/** Handshake or pong newer than this means the socket is genuinely alive. */
const FRESH_MS = HEARTBEAT_MS;
/** Sends parked while the socket is down, flushed in order on reconnect. */
const MAX_QUEUE = 50;

export class KotysSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(status: SocketStatus) => void>();
  status: SocketStatus = "connecting";
  private backoff = INITIAL_BACKOFF_MS;
  private closedByUs = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Last sign of life (handshake or pong) — drives silence detection. */
  private lastPongAt = 0;
  private queue: ClientMessage[] = [];

  /** Highest seq seen per in-flight request, for `chat:resume` on reconnect. */
  private lastSeq = new Map<number, number>();

  clientId: string | null = null;

  private config: KotysConfig;
  private ownsStream?: (requestId: number) => boolean;

  constructor(config: KotysConfig, options?: SocketOptions) {
    this.config = config;
    this.ownsStream = options?.ownsStream;
  }

  connect(): void {
    this.closedByUs = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.abandon(this.ws);

    const url = `${this.config.baseUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(this.config.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    this.setStatus("connecting");

    ws.onopen = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.lastPongAt = Date.now();
      this.backoff = INITIAL_BACKOFF_MS;
      this.startHeartbeat();
      this.setStatus("connected");
      // Ask for the tail of every stream that was running when we dropped.
      for (const [requestId, seq] of this.lastSeq) {
        this.send({
          type: "chat:resume",
          payload: { requestId, lastSeq: seq },
        });
      }
      // Deliver whatever the user sent while the socket was down.
      this.flushQueue();
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }

      if (msg.type === "ready") {
        this.clientId = msg.payload.clientId;
      }
      if (msg.type === "pong") {
        this.lastPongAt = Date.now();
        return;
      }

      if ("seq" in msg && "payload" in msg) {
        const payload = msg.payload as { requestId?: number };
        if (typeof payload.requestId === "number") {
          if (
            this.ownsStream === undefined ||
            this.ownsStream(payload.requestId)
          ) {
            this.lastSeq.set(payload.requestId, msg.seq);
          }
          if (msg.type === "chat:done" || msg.type === "chat:error") {
            this.lastSeq.delete(payload.requestId);
          }
        }
      }

      for (const listener of this.listeners) listener(msg);
    };

    ws.onclose = (ev: CloseEvent) => {
      const code = ev?.code ?? 1006;
      if (code !== 1000)
        console.warn(`[ws] closed code=${code} reason=${ev?.reason ?? ""}`);
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.stopHeartbeat();
      if (this.ws === ws) this.ws = null;
      this.setStatus("disconnected");
      if (this.closedByUs) return;
      this.reconnectTimer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    };

    ws.onerror = () => ws.close();

    // RN sockets hang in CONNECTING for a minute or more after a network
    // switch (wifi → cellular); without this the socket never recovers.
    this.connectTimer = setTimeout(() => {
      if (this.ws !== ws || ws.readyState !== WebSocket.CONNECTING) return;
      this.abandon(ws);
      this.ws = null;
      this.setStatus("disconnected");
      this.reconnectTimer = setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    }, CONNECT_TIMEOUT_MS);
  }

  /**
   * Call when the app returns to the foreground. A freshly-proven socket
   * (recent handshake or pong) is kept; anything stale — iOS froze it, the
   * carrier NAT dropped it, the attempt is hung CONNECTING — is torn down
   * and reconnected immediately, instead of probing and waiting.
   */
  wake(): void {
    const ws = this.ws;
    if (
      ws?.readyState === WebSocket.OPEN &&
      Date.now() - this.lastPongAt < FRESH_MS
    ) {
      return;
    }
    this.backoff = INITIAL_BACKOFF_MS;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.abandon(ws);
    this.ws = null;
    this.connect();
  }

  /** Sends are parked while offline and flushed on reconnect. */
  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.enqueue(msg);
      return false;
    }
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      // RN can throw synchronously on a socket that died mid-frame.
      this.enqueue(msg);
      return false;
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Fires on every transition; hooks refetch on "connected" after a drop. */
  onStatus(listener: (status: SocketStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  close(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.stopHeartbeat();
    this.queue = [];
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  /** Detach every handler and drop the socket — a late event must not fire. */
  private abandon(ws: WebSocket | null): void {
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // already gone
    }
  }

  private setStatus(status: SocketStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private enqueue(msg: ClientMessage): void {
    // Heartbeat noise: resume is re-issued by onopen from lastSeq. An append
    // targets a specific live turn; parked and replayed it would land after
    // the turn ended, so it is dropped instead — the client queue still holds
    // the text and drains as a normal message once the chat goes idle.
    if (
      msg.type === "ping" ||
      msg.type === "chat:resume" ||
      msg.type === "chat:append"
    )
      return;
    this.queue.push(msg);
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
  }

  private flushQueue(): void {
    if (this.queue.length === 0) return;
    const pending = this.queue;
    this.queue = [];
    for (const msg of pending) this.send(msg);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastPongAt >= SILENCE_TIMEOUT_MS) {
        // Half-open socket (phone slept, NAT dropped it): force a reconnect
        // instead of waiting for a TCP timeout.
        ws.close();
        return;
      }
      this.send({ type: "ping" });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === null) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
