import { formatDuration } from "../../toolDisplay";

interface ILlmDetailBodyProps {
  ms: number;
  running: boolean;
  after: number;
}

export function LlmDetailBody({ ms, running, after }: ILlmDetailBodyProps) {
  return (
    <div className="text-xs text-text">
      {running
        ? "Model is generating…"
        : after < 0
          ? "Model thinking"
          : "Model generation"}
      <div className="mt-1 text-[10px] text-text-muted/70">
        {formatDuration(ms)}
      </div>
    </div>
  );
}
