import { ExternalLink, FolderOpen } from "lucide-react";
import { usePlatform } from "@kotys/core";

export default function FileActions({ filePath }: { filePath: string }) {
  const { openExternal } = usePlatform();
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <button
        onClick={(e) => {
          e.stopPropagation();
          openExternal(filePath);
        }}
        title="Open in default app"
        aria-label="Open in default app"
        className="p-0.5 rounded text-text-muted hover:text-text transition"
      >
        <ExternalLink size={11} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          openExternal(filePath);
        }}
        title="Reveal in Finder"
        aria-label="Reveal in Finder"
        className="p-0.5 rounded text-text-muted hover:text-text transition"
      >
        <FolderOpen size={11} />
      </button>
    </span>
  );
}
