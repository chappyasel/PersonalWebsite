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
