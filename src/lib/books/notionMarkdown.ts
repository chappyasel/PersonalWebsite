/**
 * Notion's page-markdown endpoint returns a page's whole block tree in one
 * request. Walking the tree block by block costs a request per parent block:
 * 49 for Superintelligence, about 20 seconds at Notion's rate limit.
 *
 * The endpoint writes Notion's "enhanced Markdown", which the notes renderer
 * cannot read as is. The renderer reads what notion-to-md wrote:
 *
 * - Blocks end at a single newline, so adjacent quotes and paragraphs would
 *   merge. The renderer needs a blank line between blocks.
 * - Children are indented with tabs, and Markdown reads a tab-indented line
 *   under a toggle as code. Lists nest by four spaces; toggle children sit
 *   at the toggle's own level.
 * - Toggle headings are headings marked `{toggle="true"}`. The renderer draws
 *   them as toggles with a bold summary.
 * - Page mentions are `<mention-page url/>` with no title.
 * - A link mention (a pasted web link Notion shows with its site's icon and
 *   name) is `[page title](url)`, the same as a link on typed words. The
 *   renderer draws a mention differently, so it is marked `"@"`.
 * - `<empty-block/>`, `<span color>`, `<columns>` and `<file>` mean nothing to
 *   the renderer.
 *
 * convertNotionMarkdown rewrites the endpoint's text into the renderer's
 * dialect. It reports every tag it does not know, so the sync can fall back
 * to the block walk instead of publishing a page that renders wrong.
 */
import { MENTION_TITLE, isExternalLink, isPastedAddress } from "./linkPreview";

type Line = { depth: number; text: string; raw: string };

type Block =
  | { kind: "toggle"; summary: string; children: Block[] }
  | { kind: "columns"; columns: Block[][] }
  | { kind: "fence"; lines: string[] }
  | { kind: "text"; text: string; children: Block[] };

export type ConvertOptions = {
  /** A mentioned page's title, by the mention's URL. */
  titleOf?: (url: string) => string | undefined;
  /**
   * Notion's number for a numbered item that resumes a list after other
   * blocks, by the item's sibling path (`"12/0/3"`). The endpoint writes 1
   * there, but Notion keeps each item's own start (`list_start_index`), and
   * it often keeps counting past a run of bullets.
   */
  listStartAt?: (path: string) => number | undefined;
  /**
   * The addresses a block holds as link mentions, by the block's sibling
   * path. The endpoint writes a mention like any other link; in that block,
   * a link to one of these gets the title `"@"`. Keyed by block, so a
   * typed link elsewhere on the page to the same address stays a link.
   */
  linkMentionsAt?: (path: string) => ReadonlySet<string> | undefined;
};

export type ConvertedNotes = {
  markdown: string;
  /** Tags the converter left alone because it does not know them. */
  unsupported: string[];
  /** Paths of numbered items that resume a list, for `listStartAt`. */
  resumedListPaths: string[];
  /** Paths of blocks with a web link on words rather than its address,
   * which may be a link mention, for `linkMentionsAt`. */
  linkPaths: string[];
};

/** Tags the notes renderer draws itself. */
const RENDERED_TAGS = new Set([
  "br",
  "details",
  "summary",
  "strong",
  "em",
  "u",
  "s",
  "sub",
  "sup",
  "code",
]);

const CLOSER = /^<\/(details|columns|column)>$/;
const LIST_ITEM = /^(?:[-*+]|\d+\.)(?: |$)/;
const MENTION_PAGE =
  /<mention-page url="([^"]+)"(?:\s*\/>|>(.*?)<\/mention-page>)/g;
const TOGGLE_HEADING = /^(#{1,6})\s+(.*?)\s*\{toggle="true"\}$/;
/** A link that is not an image: its words, then its address. */
const WEB_LINK =
  /(?<!!)\[((?:[^\]\\]|\\.)*)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/g;

function toLines(markdown: string): Line[] {
  return markdown.split("\n").map((raw) => {
    const depth = /^\t*/.exec(raw)![0].length;
    return { depth, text: raw.slice(depth).trimEnd(), raw };
  });
}

function parseBlocks(
  lines: Line[],
  start: number,
  depth: number,
): [Block[], number] {
  const blocks: Block[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.text) {
      i++;
      continue;
    }
    if (line.depth < depth || CLOSER.test(line.text)) break;

    if (line.text === "<details>") {
      i++;
      let summary = "";
      const match = /^<summary>(.*)<\/summary>$/.exec(lines[i]?.text ?? "");
      if (match && lines[i]!.depth === line.depth) {
        summary = match[1]!;
        i++;
      }
      const [children, next] = parseBlocks(lines, i, line.depth + 1);
      i = next;
      if (lines[i]?.text === "</details>") i++;
      blocks.push({ kind: "toggle", summary, children });
      continue;
    }

    if (line.text === "<columns>") {
      i++;
      const columns: Block[][] = [];
      while (i < lines.length && lines[i]!.text !== "</columns>") {
        const column = lines[i]!;
        const [content, next] = parseBlocks(lines, i + 1, column.depth + 1);
        // A stray line between columns is kept as a column of its own.
        columns.push(
          /^<column\b[^>]*>$/.test(column.text)
            ? content
            : [{ kind: "text", text: column.text, children: [] }, ...content],
        );
        i = next;
        if (lines[i]?.text === "</column>") i++;
      }
      i++;
      blocks.push({ kind: "columns", columns });
      continue;
    }

    if (line.text.startsWith("```")) {
      const fence = [line.text];
      i++;
      while (i < lines.length) {
        const inner = lines[i]!;
        i++;
        fence.push(inner.raw.slice(Math.min(line.depth, inner.depth)));
        if (inner.depth === line.depth && inner.text === "```") break;
      }
      blocks.push({ kind: "fence", lines: fence });
      continue;
    }

    i++;
    const [children, next] = parseBlocks(lines, i, line.depth + 1);
    i = next;
    blocks.push({ kind: "text", text: line.text, children });
  }
  return [blocks, i];
}

type Context = Required<ConvertOptions> & {
  unsupported: Set<string>;
  resumedListPaths: string[];
  linkPaths: string[];
  /** The block whose own text `inline` is converting, as a sibling path;
   * null inside columns. renderBlock sets it before converting a block's
   * text and before its children, which set their own. */
  blockPath: string | null;
};

/** Sibling indexes from the page down to a block; null inside columns. */
type Path = number[] | null;

type Run = { text: string; bold: boolean; italic: boolean };

/**
 * Notion writes every formatted run on its own, so a bold word followed by
 * italics comes out as `**Wise***: …*`, and a run that ends in a space as
 * `**Golden escalator **`. Markdown reads neither: it pairs `***` wrongly
 * and will not close a marker after a space. Read the markers back into
 * runs, or null when they do not balance.
 */
function emphasisRuns(text: string): Run[] | null {
  const tokens = text.split(/((?<!\\)\*+)/);
  const runs: Run[] = [];
  let bold = false;
  let italic = false;
  for (const [index, token] of tokens.entries()) {
    if (index % 2 === 0) {
      if (token) runs.push({ text: token, bold, italic });
      continue;
    }
    // One marker toggles italics and two toggle bold, nested or not. Three
    // toggle both, whether they open both, close both, or sit between a
    // bold run and an italic one (`**Wise***: …*`). Four is bold twice.
    const count = token.length;
    if (count > 4) return null;
    if (count % 2 === 1) italic = !italic;
    if (count >= 2) bold = !bold;
  }
  return bold || italic ? null : runs;
}

const EDGE_SPACE = /^(?:\s|<br>)+|(?:\s|<br>)+$/g;

/**
 * Write runs back with each marker hugging its text. Spaces and line breaks
 * at a run's edges move outside it, and a run touching the previous run's
 * `*` marker uses `_` so the two cannot fuse into `***`.
 */
function tidyEmphasis(text: string): string {
  if (!text.includes("*")) return text;
  const runs = emphasisRuns(text);
  if (!runs) return text;
  const merged: Run[] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last?.bold === run.bold && last.italic === run.italic) {
      last.text += run.text;
    } else merged.push({ ...run });
  }
  let out = "";
  for (const run of merged) {
    const core = run.text.replace(EDGE_SPACE, "");
    if ((!run.bold && !run.italic) || !core) {
      out += run.text;
      continue;
    }
    const lead = run.text.slice(0, run.text.indexOf(core));
    const trail = run.text.slice(lead.length + core.length);
    const mark = (out + lead).endsWith("*") ? "_" : "*";
    const marker = (run.bold ? mark + mark : "") + (run.italic ? mark : "");
    out += `${lead}${marker}${core}${[...marker].reverse().join("")}${trail}`;
  }
  return out;
}

function fileLink(source: string, caption: string): string {
  let url = source;
  try {
    const decoded = decodeURIComponent(source.replace(/^file:\/\//, ""));
    const parsed = JSON.parse(decoded) as { source?: unknown };
    if (typeof parsed.source === "string") url = parsed.source;
  } catch {
    // Not the JSON form; keep the address as given.
  }
  const name =
    caption.trim() ||
    decodeURIComponent(url.split(/[?#]/, 1)[0]!.split("/").pop() ?? "") ||
    "File";
  return `[${name}](${url})`;
}

function inline(text: string, ctx: Context): string {
  let out = text
    .replace(/(?:\s*\{[a-z_]+="[^"]*"\})+$/, "")
    // Notion marks an italic line break with underscores (`_<br>_`).
    .replace(/(?<!\\)(_{1,3})(\s*(?:<br>\s*)+)\1(?!_)/g, "$2")
    .replace(/<span\b[^>]*>(.*?)<\/span>/g, "$1")
    .replace(MENTION_PAGE, (_match, url: string, label?: string) => {
      const given = label?.trim() ?? "";
      const title = given === "" ? (ctx.titleOf(url) ?? url) : given;
      return `[${title}](${url})`;
    })
    .replace(
      /<file src="([^"]*)"(?:\s*\/>|>(.*?)<\/file>)/g,
      (_match, source: string, caption?: string) =>
        fileLink(source, caption ?? ""),
    )
    .replace(WEB_LINK, (match, label: string, url: string) =>
      ctx.blockPath !== null && ctx.linkMentionsAt(ctx.blockPath)?.has(url)
        ? `[${label}](${url} "${MENTION_TITLE}")`
        : match,
    );
  out = tidyEmphasis(out)
    // notion-to-md used the file name as an image's alt text.
    .replace(/!\[\]\(([^)\s]+)\)/g, (_match, url: string) => {
      const name = decodeURIComponent(
        url.split(/[?#]/, 1)[0]!.split("/").pop() ?? "",
      );
      return `![${name}](${url})`;
    });
  for (const [, tag] of out.matchAll(/(?<!\\)<([a-z][\w-]*)/g)) {
    if (!RENDERED_TAGS.has(tag!)) ctx.unsupported.add(tag!);
  }
  return out;
}

function indent(markdown: string, prefix: string): string {
  return markdown
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}

function isListItem(block: Block): boolean {
  return block.kind === "text" && LIST_ITEM.test(block.text);
}

function renderToggle(
  summary: string,
  children: Block[],
  ctx: Context,
  path: Path,
): string {
  const body = renderBlocks(children, ctx, false, path);
  // Notion shows an empty toggle as a line with a caret that opens nothing.
  // Its summary is the content; a dropdown around it would hide nothing.
  if (!body) return summary;
  return `<details>\n<summary>${summary}</summary>\n${body}\n\n</details>`;
}

/** True when the text links words, not a pasted address, to the web: the
 * only links the endpoint may have written from a link mention. */
function hasWordLink(text: string): boolean {
  for (const [, label, url] of text.matchAll(WEB_LINK)) {
    const words = label!.replace(/^[*_]+|[*_]+$/g, "");
    if (isExternalLink(url!) && !isPastedAddress(words, url!)) return true;
  }
  return false;
}

function renderBlock(
  block: Block,
  ctx: Context,
  topLevel: boolean,
  path: Path,
): string {
  // A toggle's summary (and a toggle heading's) is raw HTML on the page:
  // the renderer draws its links plainly and slugs its anchor from the
  // literal text, so a mark there would only move the anchor.
  const isSummary =
    block.kind === "toggle" ||
    (block.kind === "text" &&
      (TOGGLE_HEADING.test(block.text) ||
        (/^#{1,6}\s/.test(block.text) && block.children.length > 0)));
  ctx.blockPath = isSummary ? null : (path?.join("/") ?? null);
  if (
    ctx.blockPath !== null &&
    block.kind === "text" &&
    hasWordLink(block.text)
  ) {
    ctx.linkPaths.push(ctx.blockPath);
  }
  switch (block.kind) {
    case "fence":
      return block.lines.join("\n");
    case "columns":
      // The renderer has no column layout; columns read top to bottom.
      // Their blocks sit a level deeper in Notion, so paths stop here.
      return renderBlocks(block.columns.flat(), ctx, topLevel, null);
    case "toggle":
      return renderToggle(
        inline(block.summary, ctx),
        block.children,
        ctx,
        path,
      );
    case "text": {
      if (block.text === "<empty-block/>") return "";
      const heading = TOGGLE_HEADING.exec(block.text);
      if (heading || (/^#{1,6}\s/.test(block.text) && block.children.length)) {
        const text = inline(block.text, ctx)
          .replace(/^#{1,6}\s+/, "")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/__(.+?)__/g, "$1")
          .trim();
        return renderToggle(
          `<strong>${text}</strong>`,
          block.children,
          ctx,
          path,
        );
      }
      // A break at the very end of a block is a stray trailing newline.
      let text = inline(block.text, ctx).replace(/(?:<br>)+$/, "");
      const isList = LIST_ITEM.test(text);
      const isQuote = text.startsWith("> ");
      // A paragraph's double break is a paragraph break, as notion-to-md
      // wrote it. Single breaks stay <br>, which the renderer draws.
      if (topLevel && !isList && !isQuote) {
        text = text.replace(/(?:<br>){2,}/g, "\n\n");
      }
      if (!block.children.length) return text;
      if (isList) {
        return `${text}\n${indent(renderBlocks(block.children, ctx, false, path), "    ")}`;
      }
      // Children of a paragraph or quote are indented in Notion but would be
      // code in Markdown; they follow the block instead.
      return `${text}\n\n${renderBlocks(block.children, ctx, topLevel, path)}`;
    }
  }
}

function renderBlocks(
  blocks: Block[],
  ctx: Context,
  topLevel: boolean,
  path: Path,
): string {
  let out = "";
  let previousWasItem = false;
  let previousNumber: number | null = null;
  let sawNumbered = false;
  for (const [index, block] of blocks.entries()) {
    const blockPath = path && [...path, index];
    let rendered = renderBlock(block, ctx, topLevel, blockPath);
    const written = block.kind === "text" ? /^(\d+)\. /.exec(block.text) : null;
    if (written) {
      let number = Number(written[1]);
      if (previousNumber !== null) number = previousNumber + 1;
      else if (sawNumbered && blockPath) {
        const key = blockPath.join("/");
        ctx.resumedListPaths.push(key);
        number = ctx.listStartAt(key) ?? number;
      }
      rendered = rendered.replace(/^\d+\./, `${number}.`);
      previousNumber = number;
      sawNumbered = true;
    } else previousNumber = null;
    if (!rendered) continue;
    // Consecutive items stay tight even when a numbered run meets bullets:
    // a blank line inside a list item would loosen its whole list.
    const item = isListItem(block);
    if (out) out += item && previousWasItem ? "\n" : "\n\n";
    out += rendered;
    previousWasItem = item;
  }
  return out;
}

/** Every page a note mentions, so the caller can look up their titles. */
export function mentionedPageUrls(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(MENTION_PAGE)].map((m) => m[1]!))];
}

export function convertNotionMarkdown(
  markdown: string,
  options: ConvertOptions = {},
): ConvertedNotes {
  const ctx: Context = {
    titleOf: options.titleOf ?? (() => undefined),
    listStartAt: options.listStartAt ?? (() => undefined),
    linkMentionsAt: options.linkMentionsAt ?? (() => undefined),
    unsupported: new Set(),
    resumedListPaths: [],
    linkPaths: [],
    blockPath: null,
  };
  const [blocks] = parseBlocks(toLines(markdown), 0, 0);
  return {
    markdown: renderBlocks(blocks, ctx, true, []),
    unsupported: [...ctx.unsupported].sort(),
    resumedListPaths: ctx.resumedListPaths,
    linkPaths: ctx.linkPaths,
  };
}
