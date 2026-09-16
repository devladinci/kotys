import type { ReactNode } from "react";

interface IProps {
  children: ReactNode;
}

export function StatusNote({ children }: IProps) {
  return (
    <div
      className="mb-2 text-xs text-amber-400 text-center py-1"
      role="status"
      aria-live="polite"
    >
      {children}
    </div>
  );
}
