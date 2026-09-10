import { describe, expect, it } from "vitest";
import { extractTitle } from "./useChatActions.js";

describe("extractTitle", () => {
  it("takes the title from a schema-shaped reply", () => {
    expect(extractTitle('{"title":"Tailscale basics"}', "fallback")).toBe(
      "Tailscale basics",
    );
  });

  it("strips wrapping quotes the model added", () => {
    expect(extractTitle('{"title":"\\"Tailnet SSH\\""}', "fallback")).toBe(
      "Tailnet SSH",
    );
  });

  it("falls back when the reply is not JSON", () => {
    const meta = "The user is asking me to generate a short title";
    expect(extractTitle(meta, "какво е Tailscale")).toBe("какво е Tailscale");
  });

  it("falls back when the title is missing or empty", () => {
    expect(extractTitle("{}", "fallback")).toBe("fallback");
    expect(extractTitle('{"title":""}', "fallback")).toBe("fallback");
    expect(extractTitle('{"title":42}', "fallback")).toBe("fallback");
  });

  it("caps the title length", () => {
    const long = "x".repeat(100);
    expect(extractTitle(JSON.stringify({ title: long }), "fb").length).toBe(60);
  });
});
