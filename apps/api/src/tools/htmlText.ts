const BLOCK_TAGS =
  /<(script|style|noscript|svg|iframe|head)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const A_HREF_RE = /<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>/gi;
const TAG_RE = /<[^>]+>/g;

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

const resolveUrl = (href: string, base: string): string | null => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

export const htmlToText = (
  html: string,
): { title: string; content: string } => {
  const titleMatch = html.match(TITLE_RE);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";
  const body = html.replace(BLOCK_TAGS, " ");
  const content = decodeEntities(body.replace(TAG_RE, " "))
    .replace(/\s+/g, " ")
    .trim();
  return { title, content };
};

export const extractLinks = (html: string, base: string): string[] => {
  const links = new Set<string>();
  for (const match of html.matchAll(A_HREF_RE)) {
    const resolved = resolveUrl(match[1], base);
    if (resolved) links.add(resolved);
  }
  return [...links];
};
