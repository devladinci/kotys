import { Fragment } from "react";
import { SNIPPET_END, SNIPPET_START } from "./constants";

export const renderSnippet = (snippet: string) =>
  snippet.split(SNIPPET_START).map((part, i) => {
    if (i === 0) return <Fragment key={i}>{part}</Fragment>;
    const [hit, ...rest] = part.split(SNIPPET_END);
    return (
      <Fragment key={i}>
        <mark className="bg-accent/30 text-text rounded-sm px-0.5">{hit}</mark>
        {rest.join(SNIPPET_END)}
      </Fragment>
    );
  });
