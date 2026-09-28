import { describe, expect, it } from "vitest";
import { speechChunks, toSpeechText } from "./speechText.js";

describe("toSpeechText", () => {
  it("keeps plain prose as it is", () => {
    expect(toSpeechText("Здравей! Как си днес?")).toBe("Здравей! Как си днес?");
  });

  it("drops fenced code, including a trailing unclosed fence", () => {
    const text =
      "Run this:\n```bash\npnpm test\n```\nThen check.\n```js\nlet a";
    expect(toSpeechText(text)).toBe("Run this: Then check.");
  });

  it("returns nothing for a code-only reply", () => {
    expect(toSpeechText("```js\nconst x = 1;\n```")).toBe("");
  });

  it("drops tables and horizontal rules", () => {
    const text = "Results:\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n---\n\nDone.";
    expect(toSpeechText(text)).toBe("Results: Done.");
  });

  it("turns headings and list items into sentences", () => {
    const text = "## Plan\n- first step\n- second step\n1. third step";
    expect(toSpeechText(text)).toBe(
      "Plan. first step. second step. third step.",
    );
  });

  it("keeps link text and inline code but drops urls and images", () => {
    const text =
      "See [the docs](https://x.dev/a) and run `pnpm lint` ![shot](a.png) at https://x.dev now.";
    expect(toSpeechText(text)).toBe("See the docs and run pnpm lint at now.");
  });

  it("unwraps emphasis without touching snake_case names", () => {
    const text = "**Bold** and *italic* and _under_ keep my_var_name ~~old~~.";
    expect(toSpeechText(text)).toBe(
      "Bold and italic and under keep my_var_name old.",
    );
  });

  it("strips quotes and html tags", () => {
    expect(toSpeechText("> quoted <b>bold</b> line")).toBe("quoted bold line.");
  });
});

describe("speechChunks", () => {
  it("returns no chunks for empty text", () => {
    expect(speechChunks("")).toEqual([]);
    expect(speechChunks("   ")).toEqual([]);
  });

  it("keeps a short reply in one chunk", () => {
    expect(speechChunks("One. Two. Three.")).toEqual(["One. Two. Three."]);
  });

  it("does not split inside numbers or at abbreviations with no space", () => {
    expect(speechChunks("It costs 3.5 GB. Fine.")).toEqual([
      "It costs 3.5 GB. Fine.",
    ]);
  });

  it("starts with a short chunk and lets later chunks grow", () => {
    const sentence = (n: number) => `Sentence number ${n} has some words.`;
    const text = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(
      " ",
    );
    const chunks = speechChunks(text);

    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[0].length).toBeLessThanOrEqual(80);
    expect(chunks[1].length).toBeGreaterThan(chunks[0].length);
    expect(chunks.every((c) => c.length <= 300)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("splits a very long sentence at word boundaries", () => {
    const text = `${"word ".repeat(200).trim()}.`;
    const chunks = speechChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 300)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("splits Cyrillic text on sentence ends", () => {
    const text = `${"Това е изречение на български език. ".repeat(10).trim()}`;
    const chunks = speechChunks(text);

    expect(chunks[0]).toBe(
      "Това е изречение на български език. Това е изречение на български език.",
    );
    expect(chunks.join(" ")).toBe(text);
  });
});
