import { describe, it, expect } from "vitest";
import { htmlToText, extractLinks } from "./htmlText.js";

describe("htmlToText", () => {
  it("extracts title and strips tags/scripts", () => {
    const html = `<html><head><title>Hi &amp; bye</title><style>.x{}</style></head><body><script>evil()</script><h1>Hello</h1><p>World</p></body></html>`;
    const out = htmlToText(html);
    expect(out.title).toBe("Hi & bye");
    expect(out.content).toBe("Hello World");
    expect(out.content).not.toContain("evil");
  });

  it("collapses whitespace and decodes entities", () => {
    const out = htmlToText("<body>a&nbsp;&nbsp;  b<br>c &lt;d&gt;</body>");
    expect(out.content).toBe("a b c <d>");
  });
});

describe("extractLinks", () => {
  it("resolves relative hrefs against the base and dedupes", () => {
    const html = `<a href="/about">A</a><a href="/about">dup</a><a href="https://ext.example/x">B</a><a href="#anchor">skip</a>`;
    const links = extractLinks(html, "https://base.example/page");
    expect(links).toEqual([
      "https://base.example/about",
      "https://ext.example/x",
    ]);
  });
});