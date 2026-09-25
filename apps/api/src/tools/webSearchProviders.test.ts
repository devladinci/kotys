import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeSearxngResults,
  getSearxngUrl,
  getWebSearchProvider,
  searchViaSearxng,
  searxngFetchHtml,
} from "./webSearchProviders.js";

vi.mock("@kotys/db", () => ({
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
}));

import { getSetting } from "@kotys/db";
const getSettingMock = vi.mocked(getSetting);

const SAMPLE_PAYLOAD = {
  results: [
    { title: "A", url: "https://a.example", content: "alpha" },
    { title: "B", url: "https://b.example", content: null },
    42,
    null,
  ],
};

describe("normalizeSearxngResults", () => {
  it("maps title/url/content and coerces non-strings to empty", () => {
    const out = normalizeSearxngResults(SAMPLE_PAYLOAD, 8);
    expect(out).toEqual([
      { title: "A", url: "https://a.example", content: "alpha" },
      { title: "B", url: "https://b.example", content: "" },
      { title: "", url: "", content: "" },
      { title: "", url: "", content: "" },
    ]);
  });

  it("slices to maxResults", () => {
    const payload = {
      results: Array.from({ length: 10 }, (_, i) => ({ title: String(i) })),
    };
    expect(normalizeSearxngResults(payload, 3)).toHaveLength(3);
  });

  it("returns [] for malformed payloads", () => {
    expect(normalizeSearxngResults(null, 5)).toEqual([]);
    expect(normalizeSearxngResults({}, 5)).toEqual([]);
    expect(normalizeSearxngResults({ results: "nope" }, 5)).toEqual([]);
  });
});

describe("provider settings", () => {
  beforeEach(() => {
    getSettingMock.mockReset();
    getSettingMock.mockReturnValue(null);
  });

  it("defaults to ollama", () => {
    expect(getWebSearchProvider()).toBe("ollama");
  });

  it("reads searxng provider and strips trailing slashes from url", () => {
    getSettingMock.mockImplementation((key: string) =>
      key === "web_search_provider"
        ? "searxng"
        : key === "searxng_url"
          ? "http://localhost:9888///"
          : null,
    );
    expect(getWebSearchProvider()).toBe("searxng");
    expect(getSearxngUrl()).toBe("http://localhost:9888");
  });
});

describe("searchViaSearxng", () => {
  beforeEach(() => {
    getSettingMock.mockReset();
    getSettingMock.mockImplementation((key: string) =>
      key === "searxng_url" ? "http://localhost:9888" : null,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hits /search?format=json and normalizes results", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(SAMPLE_PAYLOAD), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await searchViaSearxng("kotys", 5);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:9888/search?q=kotys&format=json",
      expect.objectContaining({ signal: undefined }),
    );
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({
      title: "A",
      url: "https://a.example",
      content: "alpha",
    });
  });

  it("throws on http errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );
    await expect(searchViaSearxng("kotys", 5)).rejects.toThrow(
      "SearXNG returned HTTP 403",
    );
  });

  it("throws a friendly error when URL is not configured", async () => {
    getSettingMock.mockReturnValue(null);
    await expect(searchViaSearxng("kotys", 5)).rejects.toThrow(
      "SearXNG URL is not configured",
    );
  });
});

describe("searxngFetchHtml", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns html text on 200 and throws on error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html></html>", { status: 200 })),
    );
    await expect(searxngFetchHtml("https://x.example")).resolves.toBe(
      "<html></html>",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    await expect(searxngFetchHtml("https://x.example")).rejects.toThrow(
      "HTTP 404",
    );
  });
});
