import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<() => string | null>(() => null),
  setSetting: vi.fn<() => void>(),
}));

vi.mock("@kotys/db", () => ({
  DB_PATH: "/tmp/kotys-auth-test/chat.db",
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}));

import {
  isOriginAllowed,
  isValidToken,
  originGuard,
  requireAuth,
} from "./auth.js";
import type { Context, Next } from "hono";

const ctxWith = (headers: Record<string, string>) =>
  ({
    req: { header: (n: string) => headers[n] },
    json: (body: unknown, status: number) => ({ body, status }),
  }) as unknown as Context;

beforeEach(() => {
  mocks.getSetting.mockReset();
  mocks.getSetting.mockReturnValue("b".repeat(64));
  mocks.setSetting.mockClear();
});

describe("isOriginAllowed", () => {
  it("accepts allowlisted app and dev origins", () => {
    expect(isOriginAllowed("app://kotys")).toBe(true);
    expect(isOriginAllowed("http://localhost:5173")).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:5173")).toBe(true);
  });

  it("accepts any localhost port (Vite port drift)", () => {
    expect(isOriginAllowed("http://localhost:5180")).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:4173")).toBe(true);
    expect(isOriginAllowed("https://localhost:3000")).toBe(true);
  });

  it("accepts native-app schemes (Expo Go sends exp:// on its WS handshake)", () => {
    expect(isOriginAllowed("exp://100.77.236.93:8081")).toBe(true);
    expect(isOriginAllowed("app://kotys")).toBe(true);
    expect(isOriginAllowed("file://")).toBe(true);
    expect(isOriginAllowed("capacitor://localhost")).toBe(true);
    expect(isOriginAllowed("null")).toBe(true);
  });

  it("rejects rebinding: the rebound page's own Host echoes its Origin", () => {
    expect(isOriginAllowed("http://attacker.example")).toBe(false);
    expect(isOriginAllowed("http://93.184.216.34:3017")).toBe(false);
  });

  it("accepts the dev-server origin sharing the bind host (Expo Go on device)", () => {
    expect(
      isOriginAllowed("http://100.77.236.93:8081", [], "100.77.236.93"),
    ).toBe(true);
    expect(
      isOriginAllowed("https://100.77.236.93:8082", [], "100.77.236.93"),
    ).toBe(true);
  });

  it("rejects attacker origins", () => {
    expect(isOriginAllowed("http://evil.example")).toBe(false);
    expect(isOriginAllowed("https://evil.example:443")).toBe(false);
    expect(
      isOriginAllowed("http://100.113.140.36:8081", [], "100.77.236.93"),
    ).toBe(false);
    expect(isOriginAllowed("http://100.77.236.93:8081", [], "127.0.0.1")).toBe(
      false,
    );
    expect(isOriginAllowed("")).toBe(false);
  });

  it("honors extra origins from KOTYS_ALLOWED_ORIGINS via the allowlist parameter", () => {
    expect(
      isOriginAllowed("https://kotys.example", ["https://kotys.example"]),
    ).toBe(true);
    expect(isOriginAllowed("https://kotys.example")).toBe(false);
  });

  it("wildcard bind: accepts dev-server origins on private/loopback/tailnet IPs (0.0.0.0 matches every real address)", () => {
    expect(isOriginAllowed("http://192.168.68.110:8081", [], "0.0.0.0")).toBe(
      true,
    );
    expect(isOriginAllowed("http://10.0.0.5:8081", [], "0.0.0.0")).toBe(true);
    expect(isOriginAllowed("http://100.77.236.93:8081", [], "0.0.0.0")).toBe(
      true,
    );
    expect(isOriginAllowed("http://127.0.0.1:8081", [], "0.0.0.0")).toBe(true);
  });

  it("wildcard bind: still rejects public attacker origins", () => {
    expect(isOriginAllowed("http://evil.example", [], "0.0.0.0")).toBe(false);
    expect(isOriginAllowed("http://8.8.8.8:8081", [], "0.0.0.0")).toBe(false);
  });
});

describe("originGuard middleware", () => {
  it("passes through requests with no Origin (curl, native)", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await originGuard()(ctxWith({}), async () => undefined as never);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("403s a disallowed origin and warns", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = (await originGuard()(
      ctxWith({ Origin: "http://evil.example" }),
      async () => undefined as never,
    )) as { body?: unknown; status?: number };
    expect(res.status).toBe(403);
    expect(spy).toHaveBeenCalledWith(
      "[auth] rejected origin: http://evil.example",
    );
    spy.mockRestore();
  });
});

describe("requireAuth", () => {
  it("401s a missing, malformed, or wrong token", async () => {
    for (const header of [undefined, "Basic abc", `Bearer ${"c".repeat(64)}`]) {
      const res = (await requireAuth()(
        ctxWith(header ? { Authorization: header } : {}),
        async () => undefined as never,
      )) as { status?: number };
      expect(res.status).toBe(401);
    }
  });

  it("accepts the exact stored token and proceeds", async () => {
    const token = "b".repeat(64);
    let called = false;
    const res = await requireAuth()(
      ctxWith({ Authorization: `Bearer ${token}` }),
      (async () => {
        called = true;
      }) as unknown as Next,
    );
    expect(called).toBe(true);
    expect(res).toBeUndefined();
  });

  it("rejects a token differing only at the last character (length-safe compare)", async () => {
    const bad = "b".repeat(63) + "d";
    const res = (await requireAuth()(
      ctxWith({ Authorization: `Bearer ${bad}` }),
      async () => undefined as never,
    )) as { status?: number };
    expect(res.status).toBe(401);
  });
});

describe("isValidToken", () => {
  it("rejects empty candidates without touching the store", () => {
    expect(isValidToken(undefined)).toBe(false);
    expect(isValidToken(null)).toBe(false);
    expect(isValidToken("")).toBe(false);
  });

  it("uses constant-length comparison; wrong length fails fast", () => {
    mocks.getSetting.mockReturnValue("b".repeat(64));
    expect(isValidToken("b".repeat(64))).toBe(true);
    expect(isValidToken("b".repeat(63))).toBe(false);
    expect(isValidToken("b".repeat(65))).toBe(false);
  });

  it("generates and persists a random token when none is stored", () => {
    mocks.getSetting.mockReturnValueOnce(null).mockReturnValue("still-null");
    // Any candidate fails the comparison against the freshly generated token…
    expect(isValidToken("candidate")).toBe(false);
    // …but one was created and persisted for later calls.
    expect(mocks.setSetting).toHaveBeenCalledWith(
      "api_token",
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
  });
});
