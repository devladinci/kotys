import { useState } from "react";
import { fmtTokens } from "@kotys/contracts";
import { fmtDay, fmtInt } from "./format";

export function ActivityChart({
  data,
  nowSec,
  days,
}: {
  data: { day: number; messages: number; tokens: number }[];
  nowSec: number;
  days: number;
}) {
  const [metric, setMetric] = useState<"messages" | "tokens">("messages");
  const width = 560;
  const height = 140;
  const padBottom = 22;
  const barWidth = Math.max(width / days - 2, 2);
  const max = Math.max(...data.map((d) => d[metric]), 1);
  const lastDay = Math.floor(nowSec / 86400) * 86400;
  const firstDay = lastDay - (days - 1) * 86400;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-text-muted tabular-nums">
          max {metric === "messages" ? fmtInt(max) : fmtTokens(max)}
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(["messages", "tokens"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2.5 py-1 capitalize transition ${
                metric === m
                  ? "bg-surface-2 text-text font-medium"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${metric} per day, last ${days} days`}
      >
        {data.map(({ day, messages, tokens }) => {
          const value = metric === "messages" ? messages : tokens;
          const x =
            ((day - firstDay) / (lastDay - firstDay)) * (width - barWidth - 4);
          const h = (value / max) * (height - padBottom - 8);
          return (
            <rect
              key={day}
              x={Math.max(x, 0) + 2}
              y={height - padBottom - h}
              width={barWidth}
              height={Math.max(h, 1)}
              rx={2}
              className="fill-accent"
            >
              <title>
                {`${fmtDay(day)}: ${
                  metric === "messages"
                    ? `${messages} messages`
                    : fmtTokens(tokens)
                }`}
              </title>
            </rect>
          );
        })}
        <line
          x1={0}
          x2={width}
          y1={height - padBottom + 1}
          y2={height - padBottom + 1}
          className="stroke-border"
        />
        {[firstDay, (firstDay + lastDay) / 2, lastDay].map((day, i) => (
          <text
            key={day}
            x={Math.max((i / 2) * (width - 40) + 2, 0)}
            y={height - 6}
            fontSize={10}
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            className="fill-current text-text-muted"
          >
            {fmtDay(day)}
          </text>
        ))}
      </svg>
    </div>
  );
}
