import { memo, useMemo, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import DOMPurify from "dompurify";
import MarkdownPre from "./MarkdownPre";

const sanitizeHtml = (html: string) => DOMPurify.sanitize(html, {});

const markdownComponents = {
  a: ({
    children,
    ...props
  }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) => (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  pre: MarkdownPre,
  table: (props: ComponentPropsWithoutRef<"table"> & { node?: unknown }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
};

const remarkPlugins = [remarkGfm, remarkBreaks];
const rehypePlugins = [rehypeHighlight];

interface IMarkdownBodyProps {
  content: string;
}

const MarkdownBody = memo(function MarkdownBody({
  content,
}: IMarkdownBodyProps) {
  const sanitized = useMemo(() => sanitizeHtml(content), [content]);
  return (
    <div className="prose prose-base max-w-none break-words dark:prose-invert prose-p:leading-relaxed prose-li:leading-relaxed prose-pre:bg-surface-2 prose-pre:text-text prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-code:before:content-none prose-code:after:content-none prose-code:bg-surface-2 prose-code:text-text prose-code:px-1 prose-code:py-0.5 prose-code:rounded dark:prose-pre:bg-[#1b1b1b] dark:prose-pre:text-[#e8e8e8] dark:prose-code:bg-[#1b1b1b] dark:prose-code:text-[#e8e8e8] prose-a:text-accent hover:prose-a:text-accent-hover prose-headings:mt-4 prose-headings:mb-2">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {sanitized || "\u00a0"}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownBody;
