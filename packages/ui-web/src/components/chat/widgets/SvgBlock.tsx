import { useMemo, useState } from "react";
import { sanitizeSvg } from "../../../widgets";
import WidgetPlaceholder from "./WidgetPlaceholder";
import WidgetToolbar from "./WidgetToolbar";

export default function SvgBlock({
  source,
  streaming,
}: {
  source: string;
  streaming: boolean;
}) {
  const [showSource, setShowSource] = useState(false);
  const clean = useMemo(
    () => (streaming ? null : sanitizeSvg(source)),
    [source, streaming],
  );

  if (streaming) return <WidgetPlaceholder label="Drawing diagram…" />;
  if (!clean) {
    return (
      <div className="my-2 rounded-lg border border-border bg-surface p-3">
        <div className="text-xs text-red-400 mb-2">
          This diagram could not be rendered.
        </div>
        <pre className="text-xs overflow-x-auto m-0">{source}</pre>
      </div>
    );
  }
  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden max-w-xl">
      {showSource ? (
        <pre className="text-xs overflow-x-auto p-3 m-0 bg-surface max-h-96">
          {source}
        </pre>
      ) : (
        <div
          className="bg-[#fbfbfb] p-3 [&_svg]:w-full [&_svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      )}
      <WidgetToolbar
        showSource={showSource}
        onToggle={() => setShowSource((s) => !s)}
        source={source}
      />
    </div>
  );
}
