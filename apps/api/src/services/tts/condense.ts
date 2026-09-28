import { getSetting } from "@kotys/db";
import { createOpenAiCompatibleConnector } from "../llm/openaiCompatibleConnector.js";
import { omlxConfig } from "../llm/registry.js";

const CONDENSE_MAX_CHARS = 4_000;

const CONDENSE_PROMPT = `You convert a chat reply into a short spoken version for text-to-speech.
Rules:
- Reply in {language} — the language of the original.
- At most 3 short sentences. Keep only what the user needs to hear.
- Prose only: no markdown, no tables, no lists, no code, no URLs, no emojis.
- Spell out numbers, symbols and units in words (e.g. "3.5 GB" -> "three and a half gigabytes").
- If the original is already short plain prose, return it unchanged.
Reply with the spoken text only.`;

/**
 * Voice cannot render tables, code fences or symbol soup, so a local chat
 * model rewrites the reply for listening before synthesis. Best effort: on
 * any failure the caller falls back to the raw text.
 */
export const condenseForSpeech = async (
  text: string,
  language?: string,
): Promise<string> => {
  const plain = text.replace(/```[\s\S]*?```/g, " ").trim();
  if (!plain) return text;
  const short = plain.slice(0, CONDENSE_MAX_CHARS);

  const model = getSetting("default_model");
  if (!model) return text;

  const prompt = CONDENSE_PROMPT.replace(
    "{language}",
    language ? `"${language}"` : "the same",
  );
  const connector = createOpenAiCompatibleConnector(omlxConfig());
  try {
    const { content } = await connector.chat({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: short },
      ],
      temperature: 0,
    });
    const condensed = content.trim();
    return condensed || text;
  } catch {
    return text;
  }
};
