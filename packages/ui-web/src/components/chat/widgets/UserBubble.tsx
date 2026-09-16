import type { ReactNode } from "react";

interface IProps {
  children: ReactNode;
}

export function UserBubble({ children }: IProps) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-user px-3 py-2">
      {children}
    </div>
  );
}
