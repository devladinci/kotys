import { Zap } from "lucide-react";

/**
 * The compact chip rendered in place of a `kotys-skill:` fenced block — sits
 * inline in the message flow, like a todo card does, instead of replacing the
 * whole message. The typed `/name args` line above it carries the arguments.
 */
export default function SkillChip({ name }: { name: string }) {
  return (
    <div className="my-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/30 text-xs text-text">
      <Zap size={12} className="text-accent shrink-0" aria-hidden />
      <span className="font-mono font-medium">{name}</span>
    </div>
  );
}
