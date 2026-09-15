import http from "node:http";
import type { AddressInfo } from "node:net";
import { initDatabase } from "@kotys/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  pendingServerFor,
  startCallbackServer,
  stopCallbackServer,
} from "./oauth.js";

const SERVER = "test-server";

function start(serverName: string, state: string): Promise<string> {
  return startCallbackServer(serverName, state);
}

function portOf(server: http.Server): number {
  return (server.address() as AddressInfo).port;
}

function closed(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function serverEventually(
  serverName: string,
  notServer?: http.Server,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = (): void => {
      const server = pendingServerFor(serverName);
      if (server && server !== notServer) {
        resolve(server);
        return;
      }
      if (Date.now() - started > 2_000) {
        reject(new Error(`callback for ${serverName} never started`));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

describe("oauth callback server", () => {
  beforeEach(() => {
    initDatabase(":memory:");
    stopCallbackServer(SERVER);
  });

  afterEach(() => {
    stopCallbackServer(SERVER);
  });

  it("stopCallbackServer actually closes the http server", async () => {
    void start(SERVER, "state-1");
    const server = await serverEventually(SERVER);
    expect(server.listening).toBe(true);

    stopCallbackServer(SERVER);
    await new Promise((resolve) => server.close(resolve));
    expect(server.listening).toBe(false);
  });

  it("a second start for the same server name replaces the first listener", async () => {
    void start(SERVER, "state-1");
    const first = await serverEventually(SERVER);
    const firstPort = portOf(first);

    void start(SERVER, "state-2");
    const second = await serverEventually(SERVER, first);
    expect(portOf(second)).toBe(firstPort);

    stopCallbackServer(SERVER);
    await closed(second);
    await closed(first);
    expect(second.listening).toBe(false);
    expect(first.listening).toBe(false);
  });
});
