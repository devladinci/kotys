import { describe, expect, it } from "vitest";
import { parseSkillDir, splitFrontmatter } from "./parse.js";

const fm = (body: string) => `---\n${body}\n---\n`;

describe("splitFrontmatter", () => {
  it("splits valid frontmatter from the body", () => {
    const out = splitFrontmatter(
      fm('name: pdf\ndescription: "Reads PDFs."') + "\n# Body\n",
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.frontmatter.name).toBe("pdf");
      expect(out.body).toBe("\n# Body\n");
    }
  });

  it("rejects a file that does not start with ---", () => {
    const out = splitFrontmatter("# Just markdown\n");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/frontmatter/);
  });

  it("rejects unclosed frontmatter", () => {
    const out = splitFrontmatter("---\nname: pdf\n");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/closed/);
  });

  it("rejects < and > anywhere in the frontmatter", () => {
    const out = splitFrontmatter(
      fm('name: pdf\ndescription: "Inject <system> here"'),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/[<>]/);
  });

  it("rejects invalid YAML", () => {
    const out = splitFrontmatter("---\nname: [unclosed\n---\n");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/YAML/);
  });

  it("rejects a non-mapping frontmatter", () => {
    const out = splitFrontmatter("---\n- just\n- a list\n---\n");
    expect(out.ok).toBe(false);
  });
});

describe("frontmatter validation", () => {
  it("accepts the Claude Code extensions", () => {
    const out = splitFrontmatter(
      fm(
        "name: pdf\ndescription: d\nuser-invocable: false\ndisable-model-invocation: true\nargument-hint: '[n]'",
      ),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.frontmatter["user-invocable"]).toBe(false);
      expect(out.frontmatter["disable-model-invocation"]).toBe(true);
      expect(out.frontmatter["argument-hint"]).toBe("[n]");
    }
  });

  it("rejects unknown-name characters (underscores, caps, spaces)", () => {
    for (const name of [
      "my_skill",
      "MySkill",
      "has space",
      "-lead",
      "trail-",
      "dou--ble",
    ]) {
      const out = splitFrontmatter(fm(`name: ${name}\ndescription: d`));
      expect(out.ok, name).toBe(false);
    }
  });

  it("rejects a missing or empty description", () => {
    expect(splitFrontmatter(fm("name: pdf")).ok).toBe(false);
    expect(splitFrontmatter(fm("name: pdf\ndescription: ''")).ok).toBe(false);
  });

  it("rejects a description over 1024 chars", () => {
    const out = splitFrontmatter(
      fm(`name: pdf\ndescription: ${"x".repeat(1025)}`),
    );
    expect(out.ok).toBe(false);
  });

  it("accepts an unknown extra field loosely enough to error clearly", () => {
    // zod's default object mode strips unknown keys, so a copied Claude-Code
    // skill with `model: x` still parses.
    const out = splitFrontmatter(fm("name: pdf\ndescription: d\nmodel: opus"));
    expect(out.ok).toBe(true);
  });
});

describe("parseSkillDir", () => {
  const body = fm("name: pdf\ndescription: Reads PDFs.") + "Do the thing.";

  it("accepts when the name matches the directory", () => {
    const out = parseSkillDir("pdf", body);
    expect(out.ok).toBe(true);
  });

  it("enforces the spec's name-matches-directory rule", () => {
    const out = parseSkillDir("pdf-tools", body);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/does not match/);
  });
});
