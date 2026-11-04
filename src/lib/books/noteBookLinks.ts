import type { MarkdownNode } from "./headingAnchors";
import { walkNoteBlocks } from "./noteChunks";
import type { NoteExcerptSegment } from "./notesSearch";

/** One book a book's notes link to, and where. */
export type NoteBookLink = {
  /** The linked book, as `resolve` named it. */
  bookId: string;
  /** The book page's id for the chapter or takeaway holding the link. */
  anchor: string | null;
  /** The line holding the link, the link's own words marked. */
  excerpt: NoteExcerptSegment[];
  /** The link's own words. */
  text: string;
};

/**
 * The words kept before the link. Longer than a search excerpt's lead-in:
 * on a backlink row the link's words are always the open book's title, so
 * the point it stands beside matters more than seeing the title itself.
 */
const MAX_LEAD_IN = 120;
/** A line is a bullet or a paragraph; a long one is cut after the link. */
const MAX_EXCERPT_CHARS = 240;

// The elements a line is read from: a bullet, a paragraph, a table cell.
const LINE_TAGS = new Set(["li", "p", "td", "th"]);
// Not read as part of a line: a nested list is its own lines.
const SKIP_TAGS = new Set(["ul", "ol", "img", "input"]);

const isElement = (node: MarkdownNode, tag: string) =>
  node.type === "element" && node.tagName === tag;

/** A line's words as segments, `link` marked. */
function lineSegments(
  line: MarkdownNode,
  link: MarkdownNode | null,
): NoteExcerptSegment[] {
  const segments: NoteExcerptSegment[] = [];
  const push = (text: string, match: boolean) => {
    const last = segments.at(-1);
    if (last?.match === match) last.text += text;
    else segments.push({ text, match });
  };
  const read = (node: MarkdownNode, match: boolean) => {
    if (node.type === "text") return push(node.value ?? "", match);
    if (node.type !== "element") return;
    if (node.tagName === "br") return push(" ", match);
    if (SKIP_TAGS.has(node.tagName ?? "")) return;
    for (const child of node.children ?? [])
      read(child, match || child === link);
  };
  for (const child of line.children ?? []) read(child, child === link);
  return segments;
}

const ownText = (line: MarkdownNode) =>
  lineSegments(line, null)
    .map((segment) => segment.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

// Joins a bare link to the line that says why, as search excerpts join
// bullets.
const LINE_BREAK = " · ";

/**
 * The bullet that says why a bullet holding only a link is there. Most such
 * links stand under the point they support, over a comment on the book, or
 * after the point they follow, in that order of preference.
 */
function contextOfBareLink(
  item: MarkdownNode,
  path: MarkdownNode[],
): { before: string } | { after: string } | null {
  const list = path.at(-1);
  const parent = path.at(-2);
  if (parent && isElement(parent, "li")) {
    const text = ownText(parent);
    if (text) return { before: text };
  }
  const child = item.children
    ?.find((node) => isElement(node, "ul") || isElement(node, "ol"))
    ?.children?.find((node) => isElement(node, "li"));
  const childText = child ? ownText(child) : "";
  if (childText) return { after: childText };
  const items = (list?.children ?? []).filter((node) => isElement(node, "li"));
  const index = items.indexOf(item);
  const previous = index > 0 ? ownText(items[index - 1]!) : "";
  if (previous) return { before: previous };
  const next = index >= 0 && items[index + 1] ? ownText(items[index + 1]!) : "";
  return next ? { after: next } : null;
}

/**
 * A line flattened to one run of text and cut to fit a row: a short
 * lead-in before the link, cut at a word, and a cap after it.
 */
function fitExcerpt(segments: NoteExcerptSegment[]): NoteExcerptSegment[] {
  const squashed = segments
    .map((segment) => ({ ...segment, text: segment.text.replace(/\s+/g, " ") }))
    .filter((segment) => segment.text);
  const first = squashed[0];
  if (first && !first.match) first.text = first.text.trimStart();
  const last = squashed.at(-1);
  if (last && !last.match) last.text = last.text.trimEnd();

  if (first && !first.match && first.text.length > MAX_LEAD_IN) {
    const tail = first.text.slice(-MAX_LEAD_IN);
    first.text = `…${tail.slice(tail.indexOf(" ") + 1)}`;
  }

  let room = MAX_EXCERPT_CHARS;
  const fitted: NoteExcerptSegment[] = [];
  for (const segment of squashed) {
    if (room <= 0) break;
    if (segment.text.length <= room || segment.match) {
      fitted.push(segment);
      room -= segment.text.length;
      continue;
    }
    const cut = segment.text.slice(0, room);
    const space = cut.lastIndexOf(" ");
    fitted.push({
      text: `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`,
      match: false,
    });
    break;
  }
  return fitted.filter((segment) => segment.text);
}

/**
 * The books a book's notes link to, each once, in the order the notes first
 * link them, with the line and chapter of that first link. `resolve` names
 * the book an address points to, or null for any other address. Notes are
 * read the way the page renders them (walkNoteBlocks), so each anchor is one
 * the page has and a folded takeaway opens on arrival.
 */
export function bookLinksInNotes(
  notes: string,
  resolve: (href: string) => string | null,
): NoteBookLink[] {
  const links = new Map<string, NoteBookLink>();
  walkNoteBlocks(notes, (block, noteContext) => {
    const find = (
      node: MarkdownNode,
      line: MarkdownNode,
      path: MarkdownNode[],
    ) => {
      const href = node.properties?.href;
      if (isElement(node, "a") && typeof href === "string") {
        const bookId = resolve(href);
        if (bookId && !links.has(bookId)) {
          let segments = lineSegments(line, node);
          const text = segments
            .filter((segment) => segment.match)
            .map((segment) => segment.text)
            .join("")
            .replace(/\s+/g, " ")
            .trim();
          const bare = segments.every(
            (segment) => segment.match || !/[\p{L}\p{N}]/u.test(segment.text),
          );
          const context =
            bare && isElement(line, "li")
              ? contextOfBareLink(line, path.slice(0, path.indexOf(line)))
              : null;
          if (context && "before" in context)
            segments = [
              { text: `${context.before}${LINE_BREAK}`, match: false },
              { text, match: true },
            ];
          else if (context)
            segments = [
              { text, match: true },
              { text: `${LINE_BREAK}${context.after}`, match: false },
            ];
          links.set(bookId, {
            bookId,
            anchor: noteContext.anchor,
            excerpt: fitExcerpt(segments),
            text,
          });
        }
      }
      for (const child of node.children ?? [])
        find(child, LINE_TAGS.has(child.tagName ?? "") ? child : line, [
          ...path,
          child,
        ]);
    };
    find(block, block, [block]);
  });
  return [...links.values()];
}
