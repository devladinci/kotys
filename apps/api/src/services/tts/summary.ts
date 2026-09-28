import type { ModelListing } from "@kotys/contracts";
import { getMessage, getSetting } from "@kotys/db";
import { resolveConnector, resolveOllamaConnector } from "../llm/registry.js";

export const TTS_SUMMARY_MODEL_SETTING = "tts_summary_model";

const INPUT_MAX_CHARS = 12_000;
const MAX_TOKENS = 800;
const TIMEOUT_MS = 20_000;
const SPEECH_PART = /<speech>([\s\S]*?)(?:<\/speech>|$)/;

const PROMPT = `You turn chat replies into short scripts for a text-to-speech voice.
Write in the same language as the reply. Use at most about 100 words of plain spoken sentences: no markdown, lists, tables, code, emoji, links or file paths. Start with the main point and keep only the facts, names and numbers that matter. Instead of reading out a table or code, say in one sentence what it shows or does. Do not add anything that is not in the reply, and do not mention that this is a summary.
Put the script between <speech> and </speech>.`;

type SummaryModel = Pick<ModelListing, "name" | "source" | "provider">;

const parseSummaryModel = (value: string | null): SummaryModel | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SummaryModel>;
    const isValid =
      typeof parsed.name === "string" &&
      (parsed.source === "cloud" || parsed.source === "local");

    return isValid ? (parsed as SummaryModel) : null;
  } catch {
    return null;
  }
};

const connectorFor = (model: SummaryModel) =>
  model.provider && model.provider !== "ollama"
    ? resolveConnector({ provider: model.provider, model: model.name })
    : resolveOllamaConnector(model.source);

const speechPart = (content: string): string =>
  SPEECH_PART.exec(content)?.[1].trim() ?? "";

export async function summarizeForSpeech(
  messageId: number,
): Promise<string | null> {
  const model = parseSummaryModel(getSetting(TTS_SUMMARY_MODEL_SETTING));
  const message = getMessage(messageId);
  if (!model || !message) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("The summary model took too long")),
      TIMEOUT_MS,
    );
  });

  try {
    const { content } = await Promise.race([
      connectorFor(model).chat({
        model: model.name,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: message.content.slice(0, INPUT_MAX_CHARS) },
        ],
        temperature: 0,
        maxTokens: MAX_TOKENS,
        think: false,
      }),
      expired,
    ]);
    const script = speechPart(content);
    if (!script) throw new Error("The summary model returned no script");

    return script;
  } finally {
    clearTimeout(timer);
  }
}
