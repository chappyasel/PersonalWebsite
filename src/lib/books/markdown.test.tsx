import type { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";

import {
  type NotionMarkdownBlock,
  separateAdjacentQuoteBlocks,
  separateCachedQuoteBlocks,
  toggleHeadings,
} from "./markdown";

const n2m = new NotionToMarkdown({ notionClient: {} as Client });

function quote(blockId: string, parent: string): NotionMarkdownBlock {
  return { type: "quote", blockId, parent, children: [] };
}

function renderBlocks(blocks: NotionMarkdownBlock[]) {
  const markdown = serializeBlocks(blocks);
  return renderToStaticMarkup(<ReactMarkdown>{markdown}</ReactMarkdown>);
}

function serializeBlocks(blocks: NotionMarkdownBlock[]) {
  const separated = separateAdjacentQuoteBlocks(blocks);
  return n2m.toMarkdownString(separated).parent ?? "";
}

describe("separateAdjacentQuoteBlocks", () => {
  it("renders adjacent Notion quote blocks as separate blockquotes", () => {
    const html = renderBlocks([
      quote("first", "> First quote"),
      quote("second", "> Second quote"),
    ]);

    expect(html.match(/<blockquote>/g)).toHaveLength(2);
  });

  it("keeps multiple lines from one Notion quote in one blockquote", () => {
    const html = renderBlocks([
      quote("multiline", "> First line  \n> Second line"),
    ]);

    expect(html.match(/<blockquote>/g)).toHaveLength(1);
    expect(html).toContain("First line");
    expect(html).toContain("Second line");
  });

  it("separates adjacent quote blocks inside nested content", () => {
    const markdown = serializeBlocks([
      {
        type: "toggle",
        blockId: "toggle",
        parent: "Quotes",
        children: [
          quote("nested-first", "> Nested first"),
          quote("nested-second", "> Nested second"),
        ],
      },
    ]);

    expect(markdown).toContain("> Nested first\n\n> Nested second");
  });
});

describe("separateCachedQuoteBlocks", () => {
  it("repairs adjacent quote blocks already stored as Markdown", () => {
    const markdown = separateCachedQuoteBlocks("> First quote\n> Second quote");
    const html = renderToStaticMarkup(
      <ReactMarkdown>{markdown}</ReactMarkdown>,
    );

    expect(html.match(/<blockquote>/g)).toHaveLength(2);
  });

  it("preserves a hard line break within one quote", () => {
    const markdown = separateCachedQuoteBlocks("> First line  \n> Second line");
    const html = renderToStaticMarkup(
      <ReactMarkdown>{markdown}</ReactMarkdown>,
    );

    expect(html.match(/<blockquote>/g)).toHaveLength(1);
  });

  it("preserves indentation when repairing nested quote blocks", () => {
    expect(
      separateCachedQuoteBlocks("    > First quote\n    > Second quote"),
    ).toBe("    > First quote\n    \n    > Second quote");
  });
});

const block = (
  type: string,
  parent: string,
  children: ReturnType<typeof toggleHeadings> = [],
) => ({ type, blockId: parent, parent, children });

describe("toggleHeadings", () => {
  it("re-types a heading with children as a bold-summary toggle", () => {
    const out = toggleHeadings([
      block("heading_3", "### Related Podcasts", [
        block("bulleted_list_item", "- https://overcast.fm/+1LeelN3PU"),
      ]),
    ]);
    expect(out[0]?.type).toBe("toggle");
    expect(out[0]?.parent).toBe("<strong>Related Podcasts</strong>");
    expect(out[0]?.children).toHaveLength(1);
  });

  it("drops bold markers from a heading typed bold in Notion", () => {
    const out = toggleHeadings([
      block("heading_2", "## **26 Tools For Combatting Chatter**", [
        block("paragraph", "On your own"),
      ]),
    ]);
    expect(out[0]?.parent).toBe(
      "<strong>26 Tools For Combatting Chatter</strong>",
    );
  });

  it("leaves a childless heading and other blocks alone", () => {
    const input = [
      block("heading_1", "# Key Takeaways"),
      block("toggle", "Already a toggle", [block("paragraph", "body")]),
      block("paragraph", "plain"),
    ];
    const out = toggleHeadings(input);
    expect(out.map((b) => b.type)).toEqual([
      "heading_1",
      "toggle",
      "paragraph",
    ]);
    expect(out[0]?.parent).toBe("# Key Takeaways");
    expect(out[1]?.parent).toBe("Already a toggle");
  });

  it("reaches headings nested inside other blocks", () => {
    const out = toggleHeadings([
      block("toggle", "outer", [
        block("heading_2", "## Inner", [block("paragraph", "deep")]),
      ]),
    ]);
    expect(out[0]?.children[0]?.type).toBe("toggle");
    expect(out[0]?.children[0]?.parent).toBe("<strong>Inner</strong>");
  });
});
