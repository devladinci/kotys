import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ built: [] as { closed: boolean }[] }));

vi.mock("@kotys/client", () => ({
  createRpcClient: () => ({}),
  KotysSocket: class {
    closed = false;
    constructor() {
      h.built.push(this);
    }
    connect() {}
    close() {
      this.closed = true;
    }
  },
}));

const { setClients, getSocket } = await import("./clients.js");

const config = (token: string) => ({ baseUrl: "http://daemon", token });

beforeEach(() => {
  h.built.length = 0;
});

describe("setClients", () => {
  it("keeps one socket when called again for the same daemon", () => {
    const first = setClients(config("t"));
    const second = setClients(config("t"));

    expect(second).toBe(first);
    expect(h.built).toHaveLength(1);
    expect(getSocket()).toBe(first);
  });

  it("replaces the socket when the token changes", () => {
    const first = setClients(config("old"));
    const second = setClients(config("new"));

    expect(second).not.toBe(first);
    expect((first as unknown as { closed: boolean }).closed).toBe(true);
    expect(getSocket()).toBe(second);
  });
});
