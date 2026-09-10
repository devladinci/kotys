import { useEffect, useMemo, useRef, useState } from "react";
import { buildWidgetDoc } from "../../../widgets";
import { MAX_WIDGET_HEIGHT, MIN_WIDGET_HEIGHT } from "./constants";
import WidgetPlaceholder from "./WidgetPlaceholder";
import WidgetToolbar from "./WidgetToolbar";

export default function HtmlBlock({
  source,
  streaming,
}: {
  source: string;
  streaming: boolean;
}) {
  const [showSource, setShowSource] = useState(false);
  const [height, setHeight] = useState(MIN_WIDGET_HEIGHT);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(
    () => (streaming ? null : buildWidgetDoc(source)),
    [source, streaming],
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow)
        return;
      const data = e.data as { __widget?: string; value?: unknown };
      if (data?.__widget !== "height" || typeof data.value !== "number") return;
      setHeight(
        Math.min(Math.max(data.value, MIN_WIDGET_HEIGHT), MAX_WIDGET_HEIGHT),
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (streaming) return <WidgetPlaceholder label="Building widget…" />;

  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden max-w-xl">
      {showSource ? (
        <pre className="text-xs overflow-x-auto p-3 m-0 bg-surface max-h-96">
          {source}
        </pre>
      ) : (
        <iframe
          ref={frameRef}
          srcDoc={doc ?? ""}
          sandbox="allow-scripts"
          title="Widget"
          className="w-full block border-0 bg-[#fbfbfb]"
          style={{ height }}
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
