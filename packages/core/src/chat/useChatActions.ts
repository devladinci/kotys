import { useCallback } from "react";
import type { ModelListing } from "@kotys/contracts";
import { getRpc } from "../shared/clients.js";

/**
 * Extracts the title from a schema-enforced JSON reply. The only acceptance
 * path is valid JSON with a non-empty string title — anything else falls
 * back to the first user text. No content guessing.
 */
export function extractTitle(raw: string, fallback: string): string {
  let title: unknown;
  try {
    title = (JSON.parse(raw) as { title?: unknown }).title;
  } catch {
    return fallback;
  }
  if (typeof title !== "string") return fallback;
  const cleaned = title
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

export function useChatActions() {
  const inferTopics = useCallback(
    async (
      chatId: number,
      text: string,
      model: ModelListing,
      onTopicsInferred?: (id: number) => void,
    ) => {
      try {
        const rows = await getRpc().chats.list();
        const counts = new Map<string, number>();
        for (const r of rows) {
          for (const t of (r.topics_blob ?? "")
            .split("\u001e")
            .filter(Boolean) as string[]) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        }
        const existing = [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 40)
          .map(([topic]) => topic);
        const existingLine =
          existing.length > 0
            ? `Existing topics in this app: ${existing.join(", ")}\nReuse existing topics when one fits this conversation (use its exact wording). Only invent a new topic when none fit. Prefer the most specific existing topic and put it first.\n\n`
            : "";
        const system = `You are a topic-tagging assistant. You MUST respond with raw JSON only — no markdown, no code fences, no backticks, no commentary. The response must start with { and end with }. Example response: {"topics":["react","hooks"]}`;
        const prompt = `${existingLine}Based on this conversation excerpt, give 1-3 short topic tags that categorize what it is about.

Rules:
- Each tag must be 1-2 plain words, lowercase letters only (no punctuation, no backticks, no code blocks, no markdown, no newlines).
- Reply with ONLY a raw JSON object: {"topics": ["tag1", "tag2"]}. Do NOT wrap it in markdown code fences.

${text.slice(0, 800)}`;
        const raw = await getRpc().ollama.chat({
          model: model.name,
          source: model.source,
          ...(model.provider ? { provider: model.provider } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          // Thinking models reason into a separate field only when thinking
          // is ON; with it off they spill reasoning into content and the
          // JSON never parses. Mirrors the main chat stream's gate.
          think: model.capabilities.includes("thinking"),
          temperature: 0,
          seed: 42,
          format: {
            type: "object",
            properties: {
              topics: {
                type: "array",
                items: { type: "string" },
                maxItems: 3,
              },
            },
            required: ["topics"],
          },
        });
        let candidates: string[];
        try {
          const parsed = JSON.parse(raw) as { topics?: unknown[] } | unknown[];
          const arr = Array.isArray(parsed) ? parsed : (parsed.topics ?? []);
          candidates = arr.filter((t): t is string => typeof t === "string");
        } catch {
          candidates = raw.split(/[,\n]/);
        }
        const topics = candidates
          .map((t) =>
            t
              .trim()
              .toLowerCase()
              .replace(/^[-\d.)\s"']+/, "")
              .replace(/["'.:]+$/, ""),
          )
          .filter((t) => t.length > 0 && t.length < 30)
          .slice(0, 3);
        if (topics.length > 0) {
          await getRpc().chats.setTopics({ id: chatId, topics });
          onTopicsInferred?.(chatId);
        }
      } catch {
        // topics are optional
      }
    },
    [],
  );

  const inferTitle = useCallback(
    async (
      chatId: number,
      firstUserText: string,
      model: ModelListing,
      onTitleInferred?: (id: number) => void,
      assistantText?: string,
    ) => {
      const fallback = firstUserText.slice(0, 60) || "New chat";
      try {
        const exchange = assistantText
          ? `User message:\n${firstUserText.slice(0, 1000)}\n\nAssistant response:\n${assistantText.slice(0, 1500)}`
          : firstUserText.slice(0, 1000);
        const system = `You name chat conversations. Reply with JSON only: {"title": "..."}. The title is at most 6 words, no quotes, no trailing punctuation. It names the SUBJECT of the exchange — never describe or discuss the request itself.`;
        const raw = (
          await getRpc().ollama.chat({
            model: model.name,
            source: model.source,
            ...(model.provider ? { provider: model.provider } : {}),
            messages: [
              { role: "system", content: system },
              { role: "user", content: exchange },
            ],
            think: model.capabilities.includes("thinking"),
            temperature: 0,
            seed: 42,
            num_predict: 512,
            format: {
              type: "object",
              properties: { title: { type: "string" } },
              required: ["title"],
            },
          })
        ).trim();
        const title = extractTitle(raw, fallback);
        await getRpc().chats.rename({ id: chatId, title });
        onTitleInferred?.(chatId);
      } catch {
        if (!assistantText) {
          try {
            await getRpc().chats.rename({ id: chatId, title: fallback });
            onTitleInferred?.(chatId);
          } catch {
            // title stays as whatever was set before
          }
        }
      }
    },
    [],
  );

  return { inferTopics, inferTitle };
}
