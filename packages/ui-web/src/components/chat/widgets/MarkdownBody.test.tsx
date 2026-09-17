import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownBody } from "./MarkdownBody";

const renderMarkdown = (content: string) =>
  render(<MarkdownBody content={content} />).container;

describe("MarkdownBody", () => {
  it("shows code with && and < > as written", () => {
    const text = renderMarkdown(
      "Use `a && b`.\n\n```ts\nfunction f<T>(x: T): Array<T> { return x; }\n```\n",
    ).textContent;
    expect(text).toContain("a && b");
    expect(text).toContain("function f<T>(x: T): Array<T>");
    expect(text).not.toContain("&amp;");
  });

  it("keeps angle-bracket text in prose", () => {
    const text = renderMarkdown(
      "Compare x<y and z>w, then call f<T>(x).",
    ).textContent;
    expect(text).toContain("x<y and z>w");
    expect(text).toContain("f<T>(x)");
  });

  it("never turns raw HTML into elements", () => {
    const container = renderMarkdown(
      'hi <img src="x" onerror="alert(1)"> <script>alert(2)</script>',
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("drops javascript: links", () => {
    const link = renderMarkdown("[click](javascript:alert(1))").querySelector(
      "a",
    );
    expect(link?.getAttribute("href") ?? "").not.toContain("javascript");
  });

  it("hands HTML widgets their script intact, inside the sandbox", () => {
    const frame = renderMarkdown(
      '```html\n<button onclick="count()">+</button><script>function count() {}</script>\n```\n',
    ).querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame?.getAttribute("srcdoc")).toContain("<script>function count");
    expect(frame?.getAttribute("srcdoc")).toContain('onclick="count()"');
  });
});
