import { describe, expect, it } from "vitest";
import { parseTailscaleIp, plausibleHost } from "./daemonHost";

describe("parseTailscaleIp", () => {
  it("returns the first valid IPv4 line", () => {
    expect(parseTailscaleIp("100.64.0.1\n")).toBe("100.64.0.1");
    expect(parseTailscaleIp("noise\n100.64.0.1\nmore\n")).toBe("100.64.0.1");
  });

  it("rejects the real-world failure: CLI error text on stdout", () => {
    const out =
      "The Tailscale GUI failed to start: The operation couldn't be completed. (Tailscale.CLIError error 3.)\n";
    expect(parseTailscaleIp(out)).toBeNull();
  });

  it("rejects malformed quads", () => {
    expect(parseTailscaleIp("1.2.3\n")).toBeNull();
    expect(parseTailscaleIp("1.2.3.4.5\n")).toBeNull();
    expect(parseTailscaleIp("999.1.1.1\n")).toBeNull();
    expect(parseTailscaleIp("")).toBeNull();
  });

  it("accepts quads within the valid range", () => {
    expect(parseTailscaleIp("255.255.255.255\n")).toBe("255.255.255.255");
    expect(parseTailscaleIp("0.0.0.0\n")).toBe("0.0.0.0");
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
  });
});
