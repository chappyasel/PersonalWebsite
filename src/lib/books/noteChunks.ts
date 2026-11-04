import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import {
  type MarkdownNode,
  chapterLabelOf,
  rehypeBookHeadingAnchors,
  textOfNode,
  toggleSummaryOf,
} from "./headingAnchors";
import { renderableNotes, withoutPlaceholders } from "./markdown";

/** One passage of a book's notes, as note search stores and returns it. */
export type NoteChunk = {
  /** The notes' top-level part: Summary, Key Takeaways, Notes, a review. */
  section: string | null;
  /** The chapter, part, or takeaway the passage sits under, if any. */
  heading: string | null;
  /**
   * The id the book page gives the passage's takeaway toggle, or else the
   * nearest chapter anchor above it, so a link lands on the passage.
   */
  anchor: string | null;
  /** The passage as plain text, list structure kept as `-` and `1.` lines. */
  text: string;
};

/**
 * About 750 tokens. Most chapters are far shorter (the median passage is
 * under 300 characters); a long one splits at line boundaries so each part
 * stays specific enough to rank on its own.
 */
const MAX_CHUNK_CHARS = 3000;

// The pipeline ReactMarkdown runs on the book page (remark-gfm, then raw HTML
// and heading anchors), so every anchor here is one the page renders.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeBookHeadingAnchors);

const isElement = (node: MarkdownNode, ...tags: string[]) =>
  node.type === "element" && tags.includes(node.tagName ?? "");

function inlineText(node: MarkdownNode): string {
  if (node.type === "text") return node.value ?? "";
  if (isElement(node, "br")) return " ";
  if (isElement(node, "img", "input")) return "";
  return node.children?.map(inlineText).join("") ?? "";
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

function listLines(list: MarkdownNode, indent: number): string[] {
  const lines: string[] = [];
  let number = Number(list.properties?.start ?? 1);
  for (const item of list.children ?? []) {
    if (!isElement(item, "li")) continue;
    const marker = list.tagName === "ol" ? `${number++}.` : "-";
    const words: string[] = [];
    const nested: string[] = [];
    for (const child of item.children ?? []) {
      if (isElement(child, "ul", "ol")) {
        nested.push(...listLines(child, indent + 2));
      } else if (isElement(child, "blockquote", "pre", "table")) {
        nested.push(
          ...blockLines(child).map(
            (line) => `${" ".repeat(indent + 2)}${line}`,
          ),
        );
      } else words.push(inlineText(child));
    }
    const text = squash(words.join(" "));
    if (text) lines.push(`${" ".repeat(indent)}${marker} ${text}`);
    lines.push(...nested);
  }
  return lines;
}

/** Text lines for a block that does not move the chapter context. */
function blockLines(node: MarkdownNode): string[] {
  if (node.type === "text") {
    const text = squash(node.value ?? "");
    return text ? [text] : [];
  }
  if (node.type !== "element") return [];
  if (isElement(node, "ul", "ol")) return listLines(node, 0);
  if (isElement(node, "blockquote"))
    return (node.children ?? []).flatMap(blockLines).map((line) => `> ${line}`);
  if (isElement(node, "pre")) return [textOfNode(node).trim()].filter(Boolean);
  if (isElement(node, "table"))
    return flowElements(node, "tr").map((row) =>
      (row.children ?? [])
        .filter((cell) => isElement(cell, "td", "th"))
        .map((cell) => squash(inlineText(cell)))
        .join(" | "),
    );
  if (isElement(node, "hr", "img")) return [];
  if (isElement(node, "div", "section", "span"))
    return (node.children ?? []).flatMap(blockLines);
  const text = squash(inlineText(node));
  return text ? [text] : [];
}

function flowElements(node: MarkdownNode, tag: string): MarkdownNode[] {
  return (node.children ?? []).flatMap((child) =>
    isElement(child, tag) ? [child] : flowElements(child, tag),
  );
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const parts: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const line of text.split("\n")) {
    if (current.length && length + line.length + 1 > MAX_CHUNK_CHARS) {
      parts.push(current.join("\n"));
      current = [];
      length = 0;
    }
    current.push(line);
    length += line.length + 1;
  }
  if (current.length) parts.push(current.join("\n"));
  return parts;
}

/** Where a block of notes sits: its part, its chapter or takeaway, and the
 * anchor the book page gives that chapter or takeaway. */
export type NoteContext = Pick<NoteChunk, "section" | "heading" | "anchor">;

/**
 * Walk a book's notes the way the page renders them, calling `visit` with
 * each block that does not itself change the context (a paragraph, a list,
 * a quote) and the context it sits in. Every part, chapter, and takeaway
 * toggle gets a context object of its own, so a new object is a passage
 * boundary, even when its fields match the one before.
 */
export function walkNoteBlocks(
  notes: string,
  visit: (node: MarkdownNode, context: NoteContext) => void,
): void {
  const markdown = renderableNotes(withoutPlaceholders(notes));
  const tree = processor.runSync(
    processor.parse(markdown),
  ) as unknown as MarkdownNode;

  let context: NoteContext = { section: null, heading: null, anchor: null };

  function flow(nodes: MarkdownNode[]) {
    for (const node of nodes) {
      const id = node.properties?.id;
      const label = chapterLabelOf(node);
      const chapter = label !== null || isElement(node, "h2", "h3", "h4");
      if (typeof id === "string" && isElement(node, "h1")) {
        context = {
          section: squash(textOfNode(node)),
          heading: null,
          anchor: id,
        };
      } else if (typeof id === "string" && chapter) {
        context = {
          ...context,
          heading: squash(textOfNode(label ?? node)),
          anchor: id,
        };
      } else if (isElement(node, "details")) {
        // A takeaway toggle is its own passage under its summary, linked to
        // the toggle (which opens when the address names it); whatever
        // chapter context it sat in comes back once it closes.
        const outer = context;
        const summary = toggleSummaryOf(node);
        // The summary is raw HTML, so its markdown (`Build **trusting
        // teams**`) arrives as literal text; the page renders it inline.
        const title = summary
          ? squash(inlineText(summary))
              .replace(/(\*\*|__)(.+?)\1/g, "$2")
              .replace(/(?<![\w*])\*(?!\s)(.+?)\*(?![\w*])/g, "$1")
          : "";
        context = { ...context };
        if (title)
          context.heading = context.heading
            ? `${context.heading} › ${title}`
            : title;
        if (typeof id === "string") context.anchor = id;
        flow((node.children ?? []).filter((child) => child !== summary));
        // Back in the outer chapter, but as a passage of its own.
        context = { ...outer };
      } else if (isElement(node, "div", "section")) {
        flow(node.children ?? []);
      } else {
        visit(node, context);
      }
    }
  }

  flow(tree.children ?? []);
}

/**
 * Split a book's notes into passages: one per chapter, part, or takeaway
 * toggle, with the section it belongs to and the anchor the book page gives
 * its chapter or toggle. Notes are read the way the page shows them, so
 * sections not written yet produce no passages.
 */
export function chunkBookNotes(notes: string): NoteChunk[] {
  const chunks: NoteChunk[] = [];
  let current: NoteContext | null = null;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    lines = [];
    if (!text || !current) return;
    for (const part of splitLong(text)) chunks.push({ ...current, text: part });
  };
  walkNoteBlocks(notes, (node, context) => {
    if (context !== current) {
      flush();
      current = context;
    }
    lines.push(...blockLines(node));
  });
  flush();
  return chunks;
}
