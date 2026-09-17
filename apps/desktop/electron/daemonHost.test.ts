import { describe, expect, it } from "vitest";

import { plausibleHost, resolveBindHost } from "./daemonHost";
describe("resolveBindHost", () => {
  it("KOTYS_HOST wins", () => {
    expect(resolveBindHost("127.0.0.1")).toBe("127.0.0.1");
    expect(resolveBindHost("100.77.236.93")).toBe("100.77.236.93");
  });

  it("malformed KOTYS_HOST falls through instead of dying on DNS", () => {
    expect(resolveBindHost("bad host")).toBe("0.0.0.0");
    expect(resolveBindHost("")).toBe("0.0.0.0");
    expect(resolveBindHost(undefined)).toBe("0.0.0.0");
    // Node can't bind to "*" or "0.0.0.0"-as-explicit-noop; normalize to the
    // real wildcard so the API's origin rule matches the actual bind.
    expect(resolveBindHost("*")).toBe("0.0.0.0");
    expect(resolveBindHost("0.0.0.0")).toBe("0.0.0.0");
  });
});

describe("plausibleHost", () => {
  it("accepts IPv4 and sane hostnames", () => {
    expect(plausibleHost("127.0.0.1")).toBe(true);
    expect(plausibleHost("100.64.0.1")).toBe(true);
    expect(plausibleHost("my-mac.tail9ac3.ts.net")).toBe(true);
    expect(plausibleHost("localhost")).toBe(true);
  });

  it("rejects error text and anything with spaces or symbols", () => {
    expect(
      plausibleHost(
        "The Tailscale GUI failed to start: The operation couldn't be completed. (Tailscale.CLIError error 3.)",
      ),
    ).toBe(false);
    expect(plausibleHost("")).toBe(false);
    expect(plausibleHost("bad host")).toBe(false);
    expect(plausibleHost("*")).toBe(false);
  });

  it("rejects mixed-case hosts (origin matching is case-insensitive; a KOTYS_HOST with capitals could never equal a real address)", () => {
    expect(plausibleHost("MyMac.local")).toBe(false);
    expect(plausibleHost("192.168.68.110")).toBe(true);
  });
});
