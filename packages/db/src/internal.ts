import { getDb } from "./client.js";

// Writes that reference a chat check it first: with foreign keys enforced they
// now throw where they used to quietly write an orphan, and a chat can be
// deleted from the sidebar while a stream or a tool call is still in flight.
// better-sqlite3 is synchronous, so check-then-write is atomic here.
export function chatExists(id: number): boolean {
  return !!getDb().prepare("SELECT 1 FROM chats WHERE id = ?").get(id);
}

// Markers the renderer turns into <mark> highlights.
const SNIPPET_START = String.fromCharCode(1);
const SNIPPET_END = String.fromCharCode(2);

export function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function makeSnippet(content: string, needle: string) {
  const flat = content.replace(/\s+/g, " ");
  const idx = flat.toLowerCase().indexOf(needle);
  if (idx < 0) return flat.slice(0, 100);
  const start = Math.max(0, idx - 45);
  const end = Math.min(flat.length, idx + needle.length + 60);
  return (
    (start > 0 ? "…" : "") +
    flat.slice(start, idx) +
    SNIPPET_START +
    flat.slice(idx, idx + needle.length) +
    SNIPPET_END +
    flat.slice(idx + needle.length, end) +
    (end < flat.length ? "…" : "")
  );
}
