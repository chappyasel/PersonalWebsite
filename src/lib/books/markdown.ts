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

/** A list item that is empty or only says Todo: `-`, `- -`, `- Todo`, `1. todo`. */
const PLACEHOLDER_ITEM = /^\s*(?:[-*+]|\d+\.)(?:\s+(?:todo|-+))?[\s.:]*$/i;
/** A paragraph that only says Todo. */
const PLACEHOLDER_TEXT = /^todo[\s.:]*$/i;
/** A line that is one bold run, the notes' chapter label (`**2-0: A Widening Gulf**`). */
const LABEL = /^\*\*(?:(?!\*\*).)+\*\*:?$/;

type NoteBlock = {
  text: string;
  /** Heading depth 1–6, 7 for a bold label, null for body blocks. */
  level: number | null;
  placeholder: boolean;
};

/** Top-level blocks, keeping toggles and indented list children whole. */
function noteBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let openToggles = 0;
  for (const line of markdown.split("\n")) {
    openToggles += (line.match(/<details>/g) ?? []).length;
    openToggles -= (line.match(/<\/details>/g) ?? []).length;
    if (line.trim() === "" && openToggles <= 0) {
      if (current.length) blocks.push(current.join("\n"));
      current = [];
    } else if (!current.length && /^\s/.test(line) && blocks.length) {
      // An indented line after a blank one continues the list above it.
      current = [blocks.pop()!, "", line];
    } else current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

function classify(text: string): NoteBlock {
  const heading = /^(#{1,6})\s/.exec(text);
  if (heading && !text.includes("\n")) {
    return { text, level: heading[1]!.length, placeholder: false };
  }
  if (LABEL.test(text)) return { text, level: 7, placeholder: false };
  if (PLACEHOLDER_TEXT.test(text.trim())) {
    return { text: "", level: null, placeholder: true };
  }
  const lines = text.split("\n");
  if (!/^(?:[-*+]|\d+\.)(?:\s|$)/.test(lines[0]!)) {
    return { text, level: null, placeholder: false };
  }
  // Drop placeholder items with no children, from the leaves up, so an item
  // whose children were all placeholders goes too.
  const indent = (line: string) => /^\s*/.exec(line)![0].length;
  let kept = lines;
  for (;;) {
    const next = kept.filter(
      (line, index) =>
        !PLACEHOLDER_ITEM.test(line) ||
        indent(kept[index + 1] ?? "") > indent(line),
    );
    if (next.length === kept.length) break;
    kept = next;
  }
  if (kept.length === lines.length) {
    return { text, level: null, placeholder: false };
  }
  const list = kept.join("\n").trim();
  return { text: list, level: null, placeholder: list === "" };
}

function pruneSections(blocks: NoteBlock[]): NoteBlock[] {
  const kept: NoteBlock[] = [];
  for (let start = 0; start < blocks.length; ) {
    const block = blocks[start]!;
    if (block.level === null) {
      if (block.text) kept.push(block);
      start++;
      continue;
    }
    let end = start + 1;
    while (end < blocks.length && (blocks[end]!.level ?? 8) > block.level)
      end++;
    const body = blocks.slice(start + 1, end);
    const keptBody = pruneSections(body);
    // A heading with nothing under it goes. A bold label goes only when
    // what followed it was a placeholder; a label on its own is a sentence.
    const empty = keptBody.length === 0;
    const hadPlaceholder = body.some((part) => part.placeholder);
    if (!empty || (block.level === 7 && !hadPlaceholder)) {
      kept.push(block, ...keptBody);
    }
    start = end;
  }
  return kept;
}

/**
 * The notes without the parts not written yet. A new Book Notes page starts
 * as a skeleton (`# Summary` / `Todo`, `- Todo` takeaways, chapter labels
 * over empty bullets), and the page should show only what has been filled
 * in: sections whose body is Todo or empty, the headings and labels left
 * with nothing under them, and empty bullets. Notes with no placeholders
 * come back unchanged.
 */
export function withoutPlaceholders(markdown: string): string {
  const original = noteBlocks(markdown);
  const kept = pruneSections(original.map(classify)).map((block) => block.text);
  const unchanged =
    kept.length === original.length &&
    kept.every((text, index) => text === original[index]);
  return unchanged ? markdown : kept.join("\n\n");
}
