export type EpochSeconds = number & { readonly __epoch: "s" };
export type EpochMillis = number & { readonly __epoch: "ms" };

export const asEpochSeconds = (n: number): EpochSeconds => n as EpochSeconds;
export const asEpochMillis = (n: number): EpochMillis => n as EpochMillis;

export const toMillis = (s: EpochSeconds): EpochMillis =>
  (s * 1000) as EpochMillis;
export const toSeconds = (m: EpochMillis): EpochSeconds =>
  Math.floor(m / 1000) as EpochSeconds;

export const epochToDate = (t: EpochMillis): Date => new Date(t);

export const secondsToDate = (
  t: number | EpochSeconds | null | undefined,
): Date | null => (t == null ? null : new Date(t * 1000));
