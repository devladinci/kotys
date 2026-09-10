import { describe, it, expect, vi } from "vitest";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

vi.mock("@kotys/db", () => ({
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
}));

const { renderMcpToolIndex, rankMcpTools, buildLoadToolsDefinition } =
  await import("./mcp.js");

const tool = (
  name: string,
  props: Record<string, unknown>,
  required: string[],
  description?: string,
): Tool =>
  ({
    name,
    description,
    inputSchema: { type: "object", properties: props, required },
  }) as unknown as Tool;

const github = {
  name: "github",
  tools: [
    tool(
      "pull_request_read",
      { method: {}, owner: {}, repo: {}, pullNumber: {} },
      ["method", "owner", "repo"],
      "Get information on a specific pull request. Supports several methods.",
    ),
    tool("get_me", {}, [], "Get details of the authenticated user."),
  ],
};

describe("renderMcpToolIndex", () => {
  it("returns empty when nothing is connected", () => {
    expect(renderMcpToolIndex([], "full")).toBe("");
  });

  it("renders signatures with optional args marked", () => {
    const out = renderMcpToolIndex([github], "full");
    expect(out).toContain(
      "pull_request_read(method, owner, repo, pullNumber?)",
    );
    expect(out).toContain("github (2 tools)");
  });

  it("truncates the description to one sentence", () => {
    const out = renderMcpToolIndex([github], "full");
    expect(out).toContain("Get information on a specific pull request.");
    expect(out).not.toContain("Supports several methods");
  });

  it("drops descriptions at the brief tier", () => {
    const out = renderMcpToolIndex([github], "brief");
    expect(out).toContain(
      "pull_request_read(method, owner, repo, pullNumber?)",
    );
    expect(out).not.toContain("Get information on a specific pull request");
  });

  it("drops signatures at the names tier", () => {
    const out = renderMcpToolIndex([github], "names");
    expect(out).toContain("pull_request_read, get_me");
    expect(out).not.toContain("(method");
  });

  it("lists an already-loaded tool by name only", () => {
    const out = renderMcpToolIndex([github], "full", ["get_me"]);
    expect(out).toContain("- get_me [loaded]");
    // Its real schema is in the tools array; the signature would be a second bill.
    expect(out).not.toContain("get_me()");
    expect(out).not.toContain("Get details of the authenticated user");
    expect(out).toContain(
      "pull_request_read(method, owner, repo, pullNumber?)",
    );
  });

  it("describes only the notation the tier actually uses", () => {
    expect(renderMcpToolIndex([github], "full")).toContain(
      "A trailing `?` marks an optional argument",
    );
    const names = renderMcpToolIndex([github], "names");
    expect(names).toContain("Names only");
    expect(names).not.toContain("A trailing `?`");
  });

  it("pluralises the tool count", () => {
    const one = { name: "slack", tools: github.tools.slice(0, 1) };
    expect(renderMcpToolIndex([one], "brief")).toContain("slack (1 tool)");
    expect(renderMcpToolIndex([github], "brief")).toContain("github (2 tools)");
  });

  it("keeps an abbreviation from cutting the description short", () => {
    const abbrev = {
      name: "web",
      tools: [
        tool(
          "fetch",
          { url: {} },
          ["url"],
          "Fetch a page, e.g. a wiki article. Returns markdown.",
        ),
      ],
    };
    const out = renderMcpToolIndex([abbrev], "full");
    expect(out).toContain("Fetch a page, e.g. a wiki article.");
    expect(out).not.toContain("Returns markdown");
  });

  it("elides argument lists past the cap", () => {
    const wide = {
      name: "jira",
      tools: [
        tool(
          "search",
          Object.fromEntries(
            Array.from({ length: 9 }, (_, i) => [`a${i}`, {}]),
          ),
          ["a0"],
        ),
      ],
    };
    const out = renderMcpToolIndex([wide], "brief");
    expect(out).toContain("a0, a1?, a2?, a3?, a4?, a5?, ...");
    expect(out).not.toContain("a6");
  });

  it("never elides a required argument", () => {
    const backloaded = {
      name: "jira",
      tools: [
        tool(
          "search",
          Object.fromEntries(
            Array.from({ length: 9 }, (_, i) => [`a${i}`, {}]),
          ),
          ["a7", "a8"],
        ),
      ],
    };
    const out = renderMcpToolIndex([backloaded], "brief");
    expect(out).toContain("search(a7, a8, a0?, a1?, a2?, a3?, ...)");
  });

  it("grows far slower per tool than the schema payload", () => {
    const realistic = (name: string) =>
      tool(
        name,
        {
          owner: { type: "string", description: "Repository owner login." },
          repo: { type: "string", description: "Repository name." },
          state: { type: "string", enum: ["open", "closed", "all"] },
          perPage: {
            type: "number",
            description: "Results per page, max 100.",
          },
        },
        ["owner", "repo"],
        "List issues in a repository with filtering and pagination support.",
      );
    const one = { name: "gh", tools: [realistic("a")] };
    const two = { name: "gh", tools: [realistic("a"), realistic("b")] };
    const indexGrowth =
      renderMcpToolIndex([two], "full").length -
      renderMcpToolIndex([one], "full").length;
    const schemaGrowth =
      JSON.stringify(two.tools).length - JSON.stringify(one.tools).length;
    expect(indexGrowth * 4).toBeLessThan(schemaGrowth);
  });
});

describe("rankMcpTools", () => {
  it("returns nothing for an empty query", () => {
    expect(rankMcpTools([github], "")).toEqual([]);
  });

  it("ranks an exact name match first", () => {
    const hits = rankMcpTools([github], "get_me");
    expect(hits[0]?.tool.name).toBe("get_me");
  });

  it("matches on description terms", () => {
    const hits = rankMcpTools([github], "authenticated user");
    expect(hits.map((h) => h.tool.name)).toContain("get_me");
  });

  it("carries the owning server", () => {
    const hits = rankMcpTools([github], "pull request");
    expect(hits[0]?.server).toBe("github");
  });

  it("ignores single-character noise terms", () => {
    expect(rankMcpTools([github], "a b c")).toEqual([]);
  });
});

describe("buildLoadToolsDefinition", () => {
  it("accepts names and query without requiring either", () => {
    const params = buildLoadToolsDefinition([github]).function.parameters as {
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(Object.keys(params.properties)).toEqual(["names", "query"]);
    expect(params.required).toBeUndefined();
  });

  it("names every connected server and its tool count", () => {
    const desc = buildLoadToolsDefinition([
      github,
      { name: "slack", tools: github.tools.slice(0, 1) },
    ]).function.description;
    expect(desc).toContain("github (2 tools)");
    expect(desc).toContain("slack (1 tool)");
  });

  it("steers away from the generic web tools", () => {
    const desc = buildLoadToolsDefinition([github]).function.description;
    expect(desc).toContain("web_fetch");
  });
});
