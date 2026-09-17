import { describe, expect, it } from "vitest";
import {
  findSlashCommands,
  findSlashQuery,
  insertSlashCommand,
  parseSlashCommand,
  substituteSkillArgs,
} from "./slashCommand.js";
import { SkillMessage } from "./SkillMessage.js";

describe("parseSlashCommand", () => {
  it("parses a bare command", () => {
    expect(parseSlashCommand("/release-notes")).toEqual({
      name: "release-notes",
      args: "",
    });
  });

  it("parses a command with arguments", () => {
    expect(parseSlashCommand("/pdf-processing this file please")).toEqual({
      name: "pdf-processing",
      args: "this file please",
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

describe("findSlashCommands", () => {
  const names = (text: string) => findSlashCommands(text).map((c) => c.name);

  it("keeps the leading command's args", () => {
    expect(findSlashCommands("/notes v1")).toEqual([
      { name: "notes", args: "v1" },
    ]);
  });

  it("finds a command after other words and takes the whole text as args", () => {
    expect(findSlashCommands(" please /notes on v1 ")).toEqual([
      {
        name: "notes",
        args: "please /notes on v1",
      },
    ]);
  });

  it("lists every candidate in order, leading first, without repeats", () => {
    expect(names("/tmp then /notes and /pdf, then /notes.")).toEqual([
      "tmp",
      "notes",
      "pdf",
    ]);
    expect(names("line one\n/notes")).toEqual(["notes"]);
  });

  it("ignores paths, file names and glued slashes", () => {
    expect(names("see /usr/bin and /notes.md or and/or")).toEqual([]);
  });

  it("ignores commands inside code", () => {
    expect(names("run `cd /notes` now")).toEqual([]);
    expect(names("```sh\nls /notes\n```\nthen /pdf")).toEqual(["pdf"]);
  });

  it("finds nothing in plain text", () => {
    expect(findSlashCommands("no commands here")).toEqual([]);
  });
});

describe("findSlashQuery", () => {
  const at = (text: string) =>
    findSlashQuery(text.replace("|", ""), text.indexOf("|"));

  it("matches the bare slash and partial names", () => {
    expect(at("/|")).toEqual({ query: "", from: 0, to: 1 });
    expect(at("/rel|")).toEqual({ query: "rel", from: 0, to: 4 });
    expect(at("/release-|")).toEqual({ query: "release-", from: 0, to: 9 });
  });

  it("matches after other words and on later lines", () => {
    expect(at("hello /no|")).toEqual({ query: "no", from: 6, to: 9 });
    expect(at("one\n/|")).toEqual({ query: "", from: 4, to: 5 });
  });

  it("takes the whole token when the cursor is inside it", () => {
    expect(at("see /re|lease v1")).toEqual({
      query: "release",
      from: 4,
      to: 12,
    });
  });

  it("rejects a cursor outside a command token", () => {
    expect(at("/notes v1|")).toBeNull();
    expect(at("|/notes")).toBeNull();
    expect(at("notes|")).toBeNull();
    expect(at("and/|or")).toBeNull();
    expect(at("/a/b|")).toBeNull();
    expect(at("/Has|")).toBeNull();
    expect(at("/no|.md")).toBeNull();
  });

  it("clamps a cursor past the end of the text", () => {
    expect(findSlashQuery("hi /", 9)).toEqual({ query: "", from: 3, to: 4 });
  });
});

describe("insertSlashCommand", () => {
  const pick = (text: string, name: string) => {
    const bare = text.replace("|", "");
    const query = findSlashQuery(bare, text.indexOf("|"));
    return query && insertSlashCommand(bare, query, name);
  };

  it("replaces a lone slash and leaves the caret after a space", () => {
    expect(pick("/|", "notes")).toEqual({ text: "/notes ", cursor: 7 });
  });

  it("keeps the words before and after the token", () => {
    expect(pick("please /no| on v1", "notes")).toEqual({
      text: "please /notes on v1",
      cursor: 14,
    });
  });

  it("replaces the whole token when the caret is inside it", () => {
    expect(pick("/re|lese v1", "release")).toEqual({
      text: "/release v1",
      cursor: 9,
    });
  });

  it("keeps a line break after the token", () => {
    expect(pick("/no|\nnext", "notes")).toEqual({
      text: "/notes \nnext",
      cursor: 7,
    });
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

  it("round-trips args that span several lines", () => {
    const msg = SkillMessage.build(
      "notes",
      "first line\n\nsecond paragraph /notes",
      "Do the thing.",
    );
    const out = SkillMessage.fromContent(msg);
    expect(out?.name).toBe("notes");
    expect(out?.args).toBe("first line\n\nsecond paragraph /notes");
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
