import { describe, expect, it } from "vitest";
import {
  buildSkillMessage,
  extractSkillMessage,
  parseSlashCommand,
  substituteSkillArgs,
} from "./slashCommand.js";

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

describe("buildSkillMessage / extractSkillMessage", () => {
  it("round-trips", () => {
    const msg = buildSkillMessage(
      "release-notes",
      "v0.1.0 v0.2.0",
      "Compare $ARGUMENTS; from $1.",
    );
    const out = extractSkillMessage(msg);
    expect(out).toEqual({
      name: "release-notes",
      args: "v0.1.0 v0.2.0",
      body: "Compare v0.1.0 v0.2.0; from v0.1.0.",
    });
  });

  it("round-trips without args", () => {
    const msg = buildSkillMessage("pdf", "", "Do the thing.");
    const out = extractSkillMessage(msg);
    expect(out?.name).toBe("pdf");
    expect(out?.body).toBe("Do the thing.");
  });

  it("returns null for ordinary messages", () => {
    expect(extractSkillMessage("just a normal message")).toBeNull();
    expect(extractSkillMessage("/not-a-skill no fence")).toBeNull();
  });
});
