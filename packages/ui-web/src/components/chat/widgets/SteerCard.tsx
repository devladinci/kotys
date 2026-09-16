import { memo } from "react";
import { CornerDownRight } from "lucide-react";
import type { SteerWidget } from "@kotys/contracts";
import { UserBubble } from "./UserBubble";
import { UserMessageBody } from "./UserMessageBody";

interface IProps {
  widget: SteerWidget;
}

function SteerCardBase({ widget }: IProps) {
  return (
    <div className="my-2 flex justify-end">
      <UserBubble>
        <div className="mb-0.5 flex items-center gap-1 text-[10px] text-text-muted select-none">
          <CornerDownRight size={10} aria-hidden="true" />
          Sent mid-reply
        </div>
        <UserMessageBody content={widget.text} />
      </UserBubble>
    </div>
  );
}

export const SteerCard = memo(SteerCardBase);
