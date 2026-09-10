// Model SVG is untrusted markup: web_fetch puts attacker-controlled text in the
// model's context, and this renderer holds the API key. Strip anything that can
// execute or reach the network, and drop the SVG entirely if it won't parse.
const SVG_BANNED_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "image",
  "use",
  "animate",
  "set",
]);

export const sanitizeSvg = (source: string): string | null => {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror")) return null;
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") return null;

  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (SVG_BANNED_TAGS.has(child.tagName.toLowerCase())) {
        child.remove();
        continue;
      }
      walk(child);
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      const isLocalRef = value.trim().startsWith("#");
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name.endsWith(":href")) && !isLocalRef)
        el.removeAttribute(attr.name);
      else if (
        value.includes("javascript:") ||
        /url\(\s*['"]?(https?:)?\/\//.test(value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
  };
  walk(root);

  // Guarantee it scales to the bubble rather than overflowing at its authored size.
  root.removeAttribute("width");
  root.removeAttribute("height");
  if (!root.getAttribute("viewBox")) return null;
  return new XMLSerializer().serializeToString(root);
};

// HTML widgets run in an opaque origin: sandbox without allow-same-origin means
// no reach into this window, so window.electronAPI (and the API key behind it)
// is unreachable even if a fetched page talked the model into emitting hostile
// markup. The CSP then denies network, so nothing inside can phone home either.
// Consequence worth knowing: no CDN libraries — widgets must be self-contained.
const WIDGET_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:";

const WIDGET_BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 14px/1.5 -apple-system, system-ui, sans-serif;
    color: #16181d;
    background: #fbfbfb;
    padding: 12px;
    overflow-x: hidden;
  }
  svg, img, canvas { max-width: 100%; }
`;

// The frame is cross-origin, so its height can't be measured from here; it
// reports its own instead. Keeps widgets from living in a fixed-height scrollbox.
const WIDGET_HEIGHT_REPORTER = `
  (function () {
    var send = function () {
      parent.postMessage(
        { __widget: 'height', value: document.documentElement.scrollHeight },
        '*',
      )
    }
    new ResizeObserver(send).observe(document.documentElement)
    addEventListener('load', send)
    send()
  })()
`;

export const buildWidgetDoc = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">` +
  `<style>${WIDGET_BASE_CSS}</style></head><body>${html}` +
  `<script>${WIDGET_HEIGHT_REPORTER}</script></body></html>`;
