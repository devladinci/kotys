import type { ToolActivity } from "@kotys/contracts";
import { isSteerActivity } from "@kotys/contracts";

export function parseTrace(toolCalls?: string | null): ToolActivity[] {
  if (!toolCalls) return [];
  try {
    const parsed = JSON.parse(toolCalls) as unknown;
    return Array.isArray(parsed) ? (parsed as ToolActivity[]) : [];
  } catch {
    return [];
  }
}

export type ReplyPart =
  // afterCall and beforeCall are exclusive trace-index bounds of its calls.
  | { kind: "reply"; text: string; afterCall: number; beforeCall: number }
  | { kind: "steer"; text: string };

export function splitReplyAtSteers(
  content: string,
  trace: (ToolActivity | null | undefined)[],
): ReplyPart[] {
  const parts: ReplyPart[] = [];
  let offset = 0;
  let afterCall = -1;
  trace.forEach((entry, index) => {
    if (!isSteerActivity(entry)) return;
    const end = Math.min(
      Math.max(entry.textOffset ?? 0, offset),
      content.length,
    );
    parts.push({
      kind: "reply",
      text: content.slice(offset, end),
      afterCall,
      beforeCall: index,
    });

    parts.push({ kind: "steer", text: entry.widget.text });
    offset = end;
    afterCall = index;
  });

  parts.push({
    kind: "reply",
    text: content.slice(offset),
    afterCall,
    beforeCall: Number.POSITIVE_INFINITY,
  });
  return parts;
}
