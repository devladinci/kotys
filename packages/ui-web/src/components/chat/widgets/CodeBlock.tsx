import { useRef, useState, type ComponentPropsWithoutRef } from "react";
import { Check, Copy } from "lucide-react";

export default function CodeBlock({
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group/code">
      <pre {...props} ref={preRef} />
      <button
        onClick={() => {
          void navigator.clipboard.writeText(preRef.current?.innerText ?? "");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        title="Copy code"
        aria-label="Copy code"
        className="absolute top-2 right-2 p-1.5 rounded-md bg-surface-2/90 border border-border text-text-muted hover:text-text opacity-0 group-hover/code:opacity-100 transition"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}
