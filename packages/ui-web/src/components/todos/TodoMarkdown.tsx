import { memo, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

// No sanitizer here on purpose. react-markdown does not render raw HTML unless
// rehype-raw is added, so there is nothing to strip — and running DOMPurify
// over the *source* (as this used to) quietly ate legitimate text like `<div>`
// inside a code fence. If raw HTML is ever enabled, sanitize the output with
// rehype-sanitize instead.
const components = {
  a: ({
    children,
    ...props
  }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) => (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

const remarkPlugins = [remarkGfm, remarkBreaks];

interface IProps {
  content: string;
}

function TodoMarkdownBase({ content }: IProps) {
  return (
    <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-p:my-1 prose-p:leading-relaxed prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:mt-2 prose-headings:mb-1 prose-code:before:content-none prose-code:after:content-none prose-code:bg-surface-2 prose-code:text-text prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-2 prose-pre:text-text prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-a:text-accent hover:prose-a:text-accent-hover">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

const TodoMarkdown = memo(TodoMarkdownBase);
export default TodoMarkdown;
