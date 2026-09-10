import { useContext, type ComponentPropsWithoutRef } from "react";
import { StreamingContext } from "./StreamingContext";
import { KOTYS_SKILL_FENCE, WIDGET_LANGUAGES } from "./constants";
import CodeBlock from "./CodeBlock";
import HtmlBlock from "./HtmlBlock";
import SkillChip from "./SkillChip";
import SvgBlock from "./SvgBlock";

type HastNode = {
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

const hastText = (node?: HastNode): string =>
  node?.value ?? (node?.children ?? []).map(hastText).join("");

export default function MarkdownPre({
  node,
  ...props
}: ComponentPropsWithoutRef<"pre"> & { node?: HastNode }) {
  const streaming = useContext(StreamingContext);
  const code = node?.children?.find((c) => c.tagName === "code");
  const classes = code?.properties?.className;
  const language = (Array.isArray(classes) ? classes : [])
    .map(String)
    .find((c) => c.startsWith("language-"))
    ?.slice("language-".length);

  if (language && WIDGET_LANGUAGES.has(language)) {
    const source = hastText(code);
    if (source.trim()) {
      return language === "svg" ? (
        <SvgBlock source={source} streaming={streaming} />
      ) : (
        <HtmlBlock source={source} streaming={streaming} />
      );
    }
  }
  // A skill invocation fence (` ```kotys-skill:name `) renders as one compact
  // chip in the message flow, not as a wall of instructions.
  if (language?.startsWith(KOTYS_SKILL_FENCE)) {
    return <SkillChip name={language.slice(KOTYS_SKILL_FENCE.length)} />;
  }
  return <CodeBlock {...props} />;
}
