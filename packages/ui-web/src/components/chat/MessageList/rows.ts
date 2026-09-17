import type { Message } from "@kotys/contracts";

export type DividerData = {
  summarizedCount: number;
  summaryText: string | null;
};

export type Row =
  | { kind: "divider"; data: DividerData }
  | { kind: "message"; message: Message; startsTurn: boolean };

function dividerData(
  messages: Message[],
  compactUpto: number,
  summary: string | null,
): DividerData {
  const summarizedCount = messages.filter(
    (m) => m.id <= compactUpto && m.role !== "system",
  ).length;
  return { summarizedCount, summaryText: summary };
}

export function buildRows(
  messages: Message[],
  compactUpto: number,
  summary: string | null,
): Row[] {
  const rows: Row[] = [];
  let dividerPlaced = false;
  messages.forEach((message, index) => {
    const crossesCompaction =
      compactUpto > 0 &&
      message.id > compactUpto &&
      index > 0 &&
      messages[index - 1].id <= compactUpto;
    if (crossesCompaction && !dividerPlaced) {
      rows.push({
        kind: "divider",
        data: dividerData(messages, compactUpto, summary),
      });
      dividerPlaced = true;
    }
    // Turn rhythm: a user message always opens a new turn (ChatGPT/Claude
    // pattern) and gets extra separation from whatever is above it.
    rows.push({
      kind: "message",
      message,
      startsTurn: message.role === "user",
    });
  });
  // A forced compact can anchor on the very last message, leaving nothing
  // after the boundary — the marker then belongs at the end of the list.
  if (compactUpto > 0 && !dividerPlaced) {
    rows.push({
      kind: "divider",
      data: dividerData(messages, compactUpto, summary),
    });
  }
  return rows;
}
