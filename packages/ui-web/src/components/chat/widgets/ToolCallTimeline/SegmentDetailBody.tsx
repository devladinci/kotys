import type { Segment } from "./model";
import { ToolDetailBody } from "./ToolDetailBody";
import { LlmDetailBody } from "./LlmDetailBody";

interface ISegmentDetailBodyProps {
  segment: Segment;
}

export function SegmentDetailBody({ segment }: ISegmentDetailBodyProps) {
  return segment.kind === "tool" ? (
    <ToolDetailBody tc={segment.tc} durationMs={segment.ms} />
  ) : (
    <LlmDetailBody
      ms={segment.ms}
      running={segment.running}
      after={segment.after}
    />
  );
}
