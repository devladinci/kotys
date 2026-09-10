import * as React from "react";
import { Check, Copy } from "lucide-react";

interface IProps {
  text: string;
}

export default function CopyTextButton({ text }: IProps) {
  const [copied, setCopied] = React.useState(false);

  const onClick = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const Icon = copied ? Check : Copy;

  return (
    <button
      className="p-1 rounded text-text-muted hover:text-text transition"
      onClick={onClick}
      title="Copy"
    >
      <Icon size={13} />
    </button>
  );
}
