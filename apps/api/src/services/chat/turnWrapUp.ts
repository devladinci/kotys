import type { ConnectorChatMessage } from "../llm/types.js";
import type { TurnStreamer } from "./turnStream.js";
import { isAbortError } from "./turnStream.js";

// Rounds cap the agentic loop; bytes cap tool output (one read_file can return
// 50 KB); prompt tokens cap context. Like opencode (session/prompt.ts): the
// loop runs until the model finishes; the cap is a runaway guard, not the
// task's end. On the final allowed round an assistant-prefill wrap-up
// (opencode's MAX_STEPS_PROMPT) makes the turn end as a summary with remaining
// work, not a mid-task cut-off.
export const MAX_TOOL_ROUNDS = 200;
export const MAX_TOOL_RESULT_BYTES = 200_000;
/**
 * oMLX rejects with `400: Prompt too long … exceeds max context window` when a
 * long tool loop walks past the model's window (the 200 KB byte budget alone
 * is ~50K tokens — more than a 32K window). The loop therefore also watches
 * the server-reported prompt size and stops before the wire does.
 */
export const CONTEXT_HEADROOM_TOKENS = 8_000;
export const LAST_ROUND_PREFILL =
  "CRITICAL — this is the final tool round for this turn. Make the calls you still need now, then stop calling tools and answer the user in plain text: state what you accomplished, what remains incomplete, and what you would do next. Do not plan further tool calls beyond this round.";
const MAX_STEPS_INSTRUCTION =
  "CRITICAL — MAXIMUM TOOL BUDGET REACHED\n\nThe tool budget for this turn (rounds, output size, or the model's context window) has been reached. Tools are disabled until your next input. Respond with text only: summarize what has been accomplished so far, list the remaining tasks that were not completed, and recommend what should be done next.";

const FINAL_ANSWER_INSTRUCTION =
  "Stop here and answer now, in plain text. No tools are available for this turn. Using only what you already have, answer my original question, and say briefly what you could not verify.";

/** Why the loop ended without the model finishing on its own. */
export type BudgetStop = "rounds" | "bytes" | "context";

/**
 * Whether the loop should keep running given the round/byte/token budgets.
 * `promptTokens` is the peak prompt so far (round N re-sends every earlier
 * round's traffic); `contextLimit` is the full window, not the compaction
 * threshold — this is the last guard before the provider rejects the request.
 */
export const budgetStop = (
  rounds: number,
  toolResultBytes: number,
  promptTokens = 0,
  contextLimit = Number.POSITIVE_INFINITY,
): BudgetStop | null => {
  if (rounds >= MAX_TOOL_ROUNDS) return "rounds";
  if (toolResultBytes >= MAX_TOOL_RESULT_BYTES) return "bytes";
  if (promptTokens + CONTEXT_HEADROOM_TOKENS >= contextLimit) return "context";
  return null;
};

/**
 * End-of-turn repair: when the loop left without prose (budget exhausted, or
 * the model wrote nothing), append the wrap-up messages and force a final
 * text-only round. Without a fresh prose-turn the model keeps calling tools
 * after the tools array is dropped, and the reply lands empty.
 */
export async function finalizeTurn(
  deps: {
    streamer: TurnStreamer;
    chatMessages: ConnectorChatMessage[];
    aborted: () => boolean;
  },
  opts: { budgetExhausted: boolean; budgetReason: BudgetStop | null },
): Promise<void> {
  const { streamer, chatMessages, aborted } = deps;
  if (opts.budgetExhausted) {
    const why =
      opts.budgetReason === "bytes"
        ? "the tool-output size limit"
        : opts.budgetReason === "context"
          ? "the model's context window"
          : "the round budget";
    chatMessages.push({ role: "assistant", content: MAX_STEPS_INSTRUCTION });
    chatMessages.push({
      role: "user",
      content: `The turn ended because ${why} was hit. If the task is not finished, say what remains and I will continue it in my next message.`,
    });
  }
  chatMessages.push({ role: "user", content: FINAL_ANSWER_INSTRUCTION });
  // Via the streamer, so the break is accumulated as well as emitted — a raw
  // onDelta here would desync the persisted row from the live stream.
  streamer.separator();
  try {
    await streamer.roundWithoutTools(false);
  } catch (err) {
    if (aborted() || isAbortError(err)) return;
    if (!streamer.content) await streamer.roundWithoutTools();
  }
}
