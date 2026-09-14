import { describe, expect, it } from "vitest";
import { createPairingService } from "./pairing.js";

describe("createPairingService", () => {
  it("mints a 4-digit zero-padded code", () => {
    const svc = createPairingService({ getToken: () => "tok" });
    const { code } = svc.start();
    expect(code).toMatch(/^\d{4}$/);
  });

  it("returns the token on a correct claim and ends the session", () => {
    const svc = createPairingService({ getToken: () => "tok" });
    const { code } = svc.start();
    expect(svc.claim(code)).toEqual({ ok: true, token: "tok" });
    expect(svc.claim(code)).toEqual({
      ok: false,
      status: 404,
      error: "no_pairing_in_progress",
    });
  });

  it("rejects a wrong code without burning the session", () => {
    const svc = createPairingService({ getToken: () => "tok" });
    const { code } = svc.start();
    expect(svc.claim("0000")).toEqual({
      ok: false,
      status: 403,
      error: "wrong_code",
    });
    expect(svc.claim(code)).toEqual({ ok: true, token: "tok" });
  });

  it("a replaced session's stale code reads as expired, not wrong", () => {
    const svc = createPairingService({ getToken: () => "tok" });
    const stale = svc.start().code;
    const fresh = svc.start().code;
    expect(svc.claim(stale)).toEqual({
      ok: false,
      status: 404,
      error: "no_pairing_in_progress",
    });
    // And it did not burn the fresh session's attempt budget.
    expect(svc.claim(fresh)).toEqual({ ok: true, token: "tok" });
  });

  it("kills the session after the attempt budget is spent", () => {
    const svc = createPairingService({
      getToken: () => "tok",
      maxAttempts: 2,
    });
    const { code } = svc.start();
    svc.claim("1111");
    svc.claim("2222");
    expect(svc.claim(code)).toEqual({
      ok: false,
      status: 429,
      error: "too_many_attempts",
    });
  });

  it("expires the code after the TTL", () => {
    let t = 1000;
    const svc = createPairingService({
      getToken: () => "tok",
      now: () => t,
      ttlMs: 500,
    });
    const { code } = svc.start();
    t += 501;
    expect(svc.claim(code)).toEqual({
      ok: false,
      status: 404,
      error: "no_pairing_in_progress",
    });
  });

  it("a fresh start replaces the previous session's code", () => {
    const svc = createPairingService({ getToken: () => "tok" });
    const first = svc.start().code;
    const second = svc.start().code;
    expect(svc.claim(first)).toEqual({
      ok: false,
      status: 404,
      error: "no_pairing_in_progress",
    });
    expect(svc.claim(second)).toEqual({ ok: true, token: "tok" });
  });
});
