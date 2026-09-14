import { describe, expect, it } from "vitest";
import {
  encodeConnectCode,
  isBackendMode,
  OWN_BACKEND,
  parseConnectCode,
} from "./backendConfig.js";

describe("parseConnectCode", () => {
  it("parses host|token", () => {
    expect(parseConnectCode("100.99.42.54|tok_en-1")).toEqual({
      kind: "connect",
      host: "100.99.42.54",
      token: "tok_en-1",
    });
  });

  it("trims whitespace around the host", () => {
    expect(parseConnectCode(" 100.99.42.54 |tok")).toEqual({
      kind: "connect",
      host: "100.99.42.54",
      token: "tok",
    });
  });

  it("accepts tailnet hostnames", () => {
    expect(parseConnectCode("vlados-macbook-pro-2|t")?.kind).toBe("connect");
  });

  it("rejects garbage", () => {
    expect(parseConnectCode("")).toBeNull();
    expect(parseConnectCode("no-separator")).toBeNull();
    expect(parseConnectCode("|token-only")).toBeNull();
    expect(parseConnectCode("host-only|")).toBeNull();
    expect(parseConnectCode("bad host|t")).toBeNull();
    expect(parseConnectCode("host|has space")).toBeNull();
    expect(parseConnectCode("host|multi|part")).toEqual({
      kind: "connect",
      host: "host",
      // Token may contain anything whitespace-free; extra | stays in the token.
      token: "multi|part",
    });
  });
});

describe("encodeConnectCode", () => {
  it("round-trips through parse", () => {
    const code = encodeConnectCode("100.99.42.54", "tok");
    expect(parseConnectCode(code)).toEqual({
      kind: "connect",
      host: "100.99.42.54",
      token: "tok",
    });
  });
});

describe("isBackendMode", () => {
  it("accepts own and valid connect modes", () => {
    expect(isBackendMode({ kind: "own" })).toBe(true);
    expect(
      isBackendMode({ kind: "connect", host: "1.2.3.4", token: "t" }),
    ).toBe(true);
  });

  it("rejects invalid modes so the app falls back to own", () => {
    expect(isBackendMode(null)).toBe(false);
    expect(isBackendMode("own")).toBe(false);
    expect(isBackendMode({ kind: "wat" })).toBe(false);
    expect(
      isBackendMode({ kind: "connect", host: "bad host", token: "t" }),
    ).toBe(false);
    expect(isBackendMode({ kind: "connect", host: "1.2.3.4", token: "" })).toBe(
      false,
    );
  });

  it("OWN_BACKEND is the default mode", () => {
    expect(OWN_BACKEND.mode).toEqual({ kind: "own" });
  });
});
