import { describe, expect, it } from "vitest";
import {
  parseSlashCommand,
  parseSlashQuery,
  substituteSkillArgs,
} from "./slashCommand.js";
import { SkillMessage } from "./SkillMessage.js";

describe("parseSlashCommand", () => {
  it("parses a bare command", () => {
    expect(parseSlashCommand("/release-notes")).toEqual({
      name: "release-notes",
      args: "",
      raw: "/release-notes",
    });
  });

  it("parses a command with arguments", () => {
    expect(parseSlashCommand("/pdf-processing this file please")).toEqual({
      name: "pdf-processing",
      args: "this file please",
      raw: "/pdf-processing this file please",
    });
  });

  it("allows leading whitespace", () => {
    expect(parseSlashCommand("  /notes v1")?.name).toBe("notes");
  });

  it("rejects text that does not start with /", () => {
    expect(parseSlashCommand("hello /notes")).toBeNull();
    expect(parseSlashCommand("notes")).toBeNull();
  });

  it("rejects invalid name shapes", () => {
    expect(parseSlashCommand("/")).toBeNull();
    expect(parseSlashCommand("/Has_Caps")).toBeNull();
    expect(parseSlashCommand("/a/b c")).toBeNull();
    expect(parseSlashCommand("/-lead")).toBeNull();
    expect(parseSlashCommand("/dou--ble")).toBeNull();
  });

  it("accepts a multi-line argument tail", () => {
    const parsed = parseSlashCommand("/notes\nline one\nline two");
    expect(parsed?.name).toBe("notes");
    expect(parsed?.args).toBe("line one\nline two");
  });
});

describe("parseSlashQuery", () => {
  it("matches the bare slash and partial names", () => {
    expect(parseSlashQuery("/")).toEqual({ query: "", args: "", raw: "/" });
    expect(parseSlashQuery("/rel")).toEqual({
      query: "rel",
      args: "",
      raw: "/rel",
    });
    expect(parseSlashQuery("/release-")).toEqual({
      query: "release-",
      args: "",
      raw: "/release-",
    });
  });

  it("parses complete commands like parseSlashCommand", () => {
    expect(parseSlashQuery("/notes v1")).toEqual({
      query: "notes",
      args: "v1",
      raw: "/notes v1",
    });
  });

  it("rejects the same text parseSlashCommand rejects", () => {
    expect(parseSlashQuery("hello /notes")).toBeNull();
    expect(parseSlashQuery("notes")).toBeNull();
    expect(parseSlashQuery("/a/b c")).toBeNull();
    expect(parseSlashQuery("/Has_Caps")).toBeNull();
  });
});

describe("substituteSkillArgs", () => {
  it("substitutes $ARGUMENTS with the whole string", () => {
    expect(substituteSkillArgs("Run on $ARGUMENTS.", "a b c")).toBe(
      "Run on a b c.",
    );
  });

  it("substitutes $0 with the whole string and $1.. positionally", () => {
    expect(substituteSkillArgs("$0 / from=$1 to=$2", "v0.1.0 v0.2.0")).toBe(
      "v0.1.0 v0.2.0 / from=v0.1.0 to=v0.2.0",
    );
  });

  it("fills unknown positions with empty strings", () => {
    expect(substituteSkillArgs("[$1] [$5]", "only")).toBe("[only] []");
  });

  it("leaves bodies with no placeholders untouched", () => {
    expect(substituteSkillArgs("No placeholders", "args")).toBe(
      "No placeholders",
    );
  });

  it("leaves $10 and currency-like text alone", () => {
    // $10 is two digits — the regex only matches single digits, and "10" is
    // the positional form of the $1 capture followed by a literal 0.
    expect(substituteSkillArgs("costs $10", "x")).toBe("costs x0");
  });
});

describe("SkillMessage", () => {
  it("round-trips through build and fromContent", () => {
    const msg = SkillMessage.build(
      "release-notes",
      "v0.1.0 v0.2.0",
      "Compare $ARGUMENTS; from $1.",
    );
    const out = SkillMessage.fromContent(msg);
    expect(out?.name).toBe("release-notes");
    expect(out?.args).toBe("v0.1.0 v0.2.0");
    expect(out?.body).toBe("Compare v0.1.0 v0.2.0; from v0.1.0.");
  });

  it("round-trips without args", () => {
    const msg = SkillMessage.build("pdf", "", "Do the thing.");
    const out = SkillMessage.fromContent(msg);
    expect(out?.name).toBe("pdf");
    expect(out?.body).toBe("Do the thing.");
  });

  it("displayContent drops the raw header and keeps args plus the fence", () => {
    const msg = SkillMessage.build("pdf", "quarterly report", "Do the thing.");
    const display = SkillMessage.fromContent(msg)!.displayContent;
    expect(display).not.toContain("/pdf");
    expect(display.startsWith("quarterly report")).toBe(true);
    expect(display).toContain("```kotys-skill:pdf");
    expect(display).toContain("Do the thing.");
  });

  it("displayContent without args is just the fence", () => {
    const msg = SkillMessage.build("pdf", "", "Do the thing.");
    const display = SkillMessage.fromContent(msg)!.displayContent;
    expect(display).toBe("```kotys-skill:pdf\nDo the thing.\n```");
  });

  it("returns null for ordinary messages", () => {
    expect(SkillMessage.fromContent("just a normal message")).toBeNull();
    expect(SkillMessage.fromContent("/not-a-skill no fence")).toBeNull();
  });
});
