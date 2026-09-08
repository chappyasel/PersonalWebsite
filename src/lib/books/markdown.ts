export type NotionMarkdownBlock = {
  type?: string;
  blockId: string;
  parent: string;
  children: NotionMarkdownBlock[];
};

export function separateAdjacentQuoteBlocks(
  blocks: NotionMarkdownBlock[],
): NotionMarkdownBlock[] {
  return blocks.map((block, index) => {
    const followsQuote =
      block.type === "quote" && blocks[index - 1]?.type === "quote";

    return {
      ...block,
      parent:
        followsQuote && !block.parent.startsWith("\n")
          ? `\n${block.parent}`
          : block.parent,
      children: separateAdjacentQuoteBlocks(block.children),
    };
  });
}

/**
 * Repair notes cached before separate Notion quote blocks gained blank lines.
 * notion-to-md marks line breaks within one quote with two trailing spaces, so
 * an unmarked transition between quote lines came from separate Notion blocks.
 */
export function separateCachedQuoteBlocks(markdown: string): string {
  return markdown.replace(/^([ \t]*)(> .*)(?<! {2})\n(?=\1> )/gm, "$1$2\n$1\n");
}

const HEADING_MARKS = /^#{1,6}\s+/;

/**
 * A toggleable heading (a heading with children) is a dropdown in Notion,
 * but notion-to-md only knows the toggle block: it writes the heading and
 * then its children indented four spaces, and four spaces of indent is a
 * code block in Markdown. A heading can only have children when it is
 * toggleable, so any heading with children is re-typed as a toggle whose
 * summary is the heading text in bold; the page then renders it as a folded
 * dropdown like any other.
 */
export function toggleHeadings(
  blocks: NotionMarkdownBlock[],
): NotionMarkdownBlock[] {
  return blocks.map((block) => {
    const children = block.children?.length
      ? toggleHeadings(block.children)
      : block.children;
    if (/^heading_[1-6]$/.test(block.type ?? "") && children?.length) {
      // The summary is already bold; a heading typed bold in Notion would
      // otherwise carry its ** markers into the tag as literal text.
      const text = block.parent
        .replace(HEADING_MARKS, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .trim();
      return {
        ...block,
        type: "toggle",
        parent: `<strong>${text}</strong>`,
        children,
      };
    }
    return { ...block, children };
  });
}
