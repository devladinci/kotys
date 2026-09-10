/**
 * `promptTokens` is the peak across the turn's rounds — round N re-sends every
 * earlier round's tool traffic — and is what the runaway guard watches.
 * `basePromptTokens` is the first round's: the part that carries into later
 * turns, so it is what the chat weighs and what gets persisted.
 */
export type TurnUsage = {
  promptTokens: number;
  basePromptTokens: number;
  evalTokens: number;
};

export const emptyUsage = (): TurnUsage => ({
  promptTokens: 0,
  basePromptTokens: 0,
  evalTokens: 0,
});

const foldRound = (
  usage: TurnUsage,
  prompt: number | undefined,
  eval_: number | undefined,
): TurnUsage => ({
  promptTokens: prompt
    ? Math.max(usage.promptTokens, prompt)
    : usage.promptTokens,
  // First report wins: a later round's prompt has this turn's tool traffic in it.
  basePromptTokens: usage.basePromptTokens || (prompt ?? 0),
  evalTokens: usage.evalTokens + (eval_ ?? 0),
});

export type ConnectorRoundCounts = {
  promptTokens?: number;
  evalTokens?: number;
};

export const applyConnectorRoundUsage = (
  usage: TurnUsage,
  round: ConnectorRoundCounts,
) => foldRound(usage, round.promptTokens, round.evalTokens);
