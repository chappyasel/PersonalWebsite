import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const inlineComponents = {
  p: ({ children }) => <>{children}</>,
} satisfies Components;

/**
 * Render Markdown in a phrasing-content context such as <summary>.
 *
 * react-markdown normally wraps a single line in a paragraph. Replacing that
 * wrapper with a fragment keeps the resulting markup valid inside <summary>.
 * Raw HTML remains disabled, matching react-markdown's safe default.
 */
export function InlineMarkdown({ source }: { source: string }) {
  const leadingWhitespace = /^\s+/.exec(source)?.[0] ?? "";
  const trailingWhitespace = /\s+$/.exec(source)?.[0] ?? "";
  const contentEnd = source.length - trailingWhitespace.length;
  const markdown = source.slice(leadingWhitespace.length, contentEnd);

  if (!markdown) return <>{source}</>;

  return (
    <>
      {leadingWhitespace}
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
        components={inlineComponents}
      >
        {markdown}
      </ReactMarkdown>
      {trailingWhitespace}
    </>
  );
}
