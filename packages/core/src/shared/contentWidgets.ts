import type { ToolActivity } from "@kotys/contracts";

export type ContentSegment =
  | { id: string; kind: "text"; text: string }
  | {
      id: string;
      kind: "widget";
      widget: NonNullable<ToolActivity["widget"]>;
    };

/**
 * Splits a turn's text around widget-bearing tool calls so each card renders
 * at the point of the conversation where it happened — question forms sit
 * between the paragraphs the model wrote around them, not after the reply.
 *
 * Calls without a recorded offset (old messages) stay out of the flow; the
 * caller renders those after the text as before.
 */
export function splitContentByWidgets(
  content: string,
  calls: (ToolActivity | null | undefined)[],
): ContentSegment[] {
  const placed: { call: ToolActivity; index: number }[] = [];
  calls.forEach((call, index) => {
    if (call?.widget && typeof call.textOffset === "number") {
      placed.push({ call, index });
    }
  });
  placed.sort(
    (a, b) =>
      (a.call.roundAnchor ?? 0) - (b.call.roundAnchor ?? 0) ||
      (a.call.textOffset ?? 0) - (b.call.textOffset ?? 0) ||
      a.index - b.index,
  );
  if (placed.length === 0) return [{ id: "all", kind: "text", text: content }];

  const segments: ContentSegment[] = [];
  let cursor = 0;
  for (const { call, index } of placed) {
    const offset = Math.min(call.textOffset ?? 0, content.length);
    const text = content.slice(cursor, offset);
    if (text.trim()) segments.push({ id: `t${index}`, kind: "text", text });
    segments.push({ id: `w${index}`, kind: "widget", widget: call.widget! });
    cursor = offset;
  }
  const rest = content.slice(cursor);
  if (rest.trim()) segments.push({ id: "tail", kind: "text", text: rest });
  return segments;
}
