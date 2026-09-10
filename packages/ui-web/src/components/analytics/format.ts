/** Shared number/date formatting for analytics displays. */
export const fmtInt = (n: number) => n.toLocaleString();

export const fmtDuration = (ms: number) => {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
};

export const fmtDay = (epochSec: number) =>
  new Date(epochSec * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
