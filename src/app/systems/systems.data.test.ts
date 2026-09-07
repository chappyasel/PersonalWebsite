import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import rawData from "~~/data/systems.json";

import { bookSlugFromUrl } from "~/lib/books/inlineFacts";
import { sitePageForHref } from "~/lib/site/pages";

import SystemsSection from "./components/SystemsSection";
import RichTextRenderer from "~/components/notion/RichTextRenderer";
import type { NotionBlock, RichText } from "~/components/notion/types";

import type { SystemsData } from "./types";
import PersonalSystems from "~/app/components/PersonalSystems";

const data = rawData as unknown as SystemsData;
const text = JSON.stringify(data);

vi.mock("~/app/components/TiltCard", () => ({
  default: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
}));

const section = (id: string) => data.sections.find((s) => s.id === id);
const layers = section("the-seven-layers")?.layers ?? [];

function* walk(blocks: NotionBlock[]): Generator<NotionBlock> {
  for (const block of blocks) {
    yield block;
    if (block.type === "toggle") yield* walk(block.children);
    else if (block.type === "callout") yield* walk(block.content);
    else if (block.type === "bulleted_list" || block.type === "numbered_list")
      for (const item of block.items) yield* walk(item);
  }
}

function* runs(blocks: NotionBlock[]): Generator<RichText> {
  for (const block of walk(blocks)) {
    if (block.type === "toggle") yield* block.title;
    else if ("content" in block && Array.isArray(block.content)) {
      for (const part of block.content as (RichText | NotionBlock)[]) {
        if ("text" in part) yield part;
      }
    }
  }
}

const everyBlock = [
  ...data.intro,
  ...data.sections.flatMap(
    (s) => s.blocks ?? s.layers.flatMap((l) => l.blocks),
  ),
];

const plain = (content: RichText[]) => content.map((r) => r.text).join("");

/**
 * The snapshot is generated, so nobody reads it before it ships. These pin
 * the shape the page, the OG image, the search index, and the homepage card
 * depend on, so a Notion restructure fails the code gate instead of
 * publishing a hollow page. The counts are the owner's acceptance list for
 * the first import.
 */
describe("systems.json snapshot", () => {
  it("carries the Notion-authored intro: two paragraphs, their links, and the Hamming quote", () => {
    const paragraphs = data.intro.filter((b) => b.type === "paragraph");
    expect(paragraphs.length).toBe(2);
    const quote = data.intro.find((b) => b.type === "quote");
    expect(quote?.type).toBe("quote");
    if (quote?.type !== "quote") return;
    expect(plain(quote.content)).toContain("Systems engineering");
    expect(plain(quote.content)).toContain("Hamming");

    const links = [...runs(data.intro)].map((r) => r.link).filter(Boolean);
    expect(links).toContain(
      "https://books.chappyasel.com/7-habits-of-highly-effective-people",
    );
    expect(links).toContain("#tips-for-getting-started");
    expect(links).toContain("#further-reading");
  });

  it("keeps the four sections the site styles by id", () => {
    // sectionIcons.tsx and systems-og-image.tsx key on these ids. A new or
    // renamed section is a deliberate change to both, not a sync.
    expect(data.sections.map((s) => s.id)).toEqual([
      "at-a-glance",
      "the-seven-layers",
      "tips-for-getting-started",
      "further-reading",
    ]);
  });

  it("keeps seven distinct layer anchors in order", () => {
    expect(layers.map((l) => l.id)).toEqual([
      "foundations",
      "direction-strategy",
      "planning-review-cycles",
      "execution-systems",
      "feedback-counsel",
      "domain-systems",
      "tools-infrastructure",
    ]);
    expect(layers.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const layer of layers) {
      expect(layer.blocks.length, layer.title).toBeGreaterThan(0);
    }
  });

  it("points every At a Glance hook at an on-page layer", () => {
    const glance = section("at-a-glance");
    const list = glance?.blocks?.find((b) => b.type === "numbered_list");
    expect(list?.type).toBe("numbered_list");
    if (list?.type !== "numbered_list") return;
    expect(list.items).toHaveLength(7);

    const anchors = layers.map((l) => `#${l.id}`);
    list.items.forEach((item, i) => {
      const first = item[0];
      expect(first?.type).toBe("paragraph");
      if (first?.type !== "paragraph") return;

      const links = [...runs(item)].map((r) => r.link).filter(Boolean);
      expect(links, plain(first.content)).toEqual([anchors[i]]);
      expect(first.content[0]?.link).toBe(anchors[i]);
      expect(first.content[0]?.bold).toBe(true);
      expect(plain(first.content)).not.toMatch(/read more/i);
    });
  });

  it("renders an At a Glance title as the underlined icon link", () => {
    const glance = section("at-a-glance");
    const list = glance?.blocks?.find(
      (block) => block.type === "numbered_list",
    );
    const first = list?.type === "numbered_list" ? list.items[0]?.[0] : null;
    expect(first?.type).toBe("paragraph");
    if (first?.type !== "paragraph") return;

    const markup = renderToStaticMarkup(
      createElement(RichTextRenderer, { content: first.content }),
    );
    expect(markup).toContain('href="#foundations"');
    expect(markup).toContain("underline");
    expect(markup).toContain("<svg");
    expect(markup).not.toContain("🧱");
    expect(markup).not.toMatch(/read more/i);
  });

  it("gives the getting-started steps and substeps more breathing room", () => {
    const tips = section("tips-for-getting-started");
    expect(tips).toBeDefined();
    if (!tips) return;

    const markup = renderToStaticMarkup(
      createElement(SystemsSection, { section: tips }),
    );
    expect(markup).toContain("list-decimal space-y-2");
    expect(markup).toContain("list-disc space-y-2");
  });

  it("preserves the 46 dropdowns with their nested bodies", () => {
    const toggles = [...walk(everyBlock)].filter((b) => b.type === "toggle");
    expect(toggles).toHaveLength(46);
    for (const toggle of toggles) {
      if (toggle.type !== "toggle") continue;
      expect(toggle.children.length, plain(toggle.title)).toBeGreaterThan(0);
    }
    const nested = toggles.filter(
      (t) =>
        t.type === "toggle" &&
        t.children.some((c) => c.type === "bulleted_list"),
    );
    expect(nested.length).toBeGreaterThanOrEqual(40);
  });

  it("lists 20 books in Further Reading, each through a library link with an annotation", () => {
    const reading = section("further-reading");
    const items =
      reading?.blocks?.flatMap((b) =>
        b.type === "numbered_list" ? b.items : [],
      ) ?? [];
    expect(items).toHaveLength(20);
    const slugs = new Set<string>();
    for (const item of items) {
      const first = item[0];
      expect(first?.type).toBe("paragraph");
      if (first?.type !== "paragraph") continue;
      // A bare library URL as the first run is what RichTextRenderer turns
      // into BookLink; the words after it are the owner's annotation.
      const [lead, ...rest] = first.content;
      const slug = bookSlugFromUrl(lead?.text ?? "");
      expect(slug, lead?.text).not.toBeNull();
      slugs.add(slug!);
      const annotation = plain(rest).replace(/^:\s*/, "").trim();
      expect(annotation.length, slug!).toBeGreaterThan(20);
    }
    expect(slugs.size).toBe(20);
  });

  it("links the manual and the routine as the site's own pages", () => {
    const links = new Set(
      [...runs(everyBlock)].map((r) => r.link).filter(Boolean),
    );
    const pages = [...links].map((href) => sitePageForHref(href!));
    expect(pages).toContain("manual");
    expect(pages).toContain("routine");
  });

  it("sends no visitor to a private Notion page", () => {
    expect(text).not.toMatch(/https:\/\/(www\.notion\.so|app\.notion\.com)\//);
    expect(text).not.toMatch(/notion\.site/);
  });

  it("resolved every workspace emoji shortcode to a downloaded file", () => {
    let seen = 0;
    for (const run of runs(everyBlock)) {
      if (!/^:[a-z0-9_-]+:$/.test(run.text.trim())) continue;
      seen++;
      expect(run.customEmoji?.src, run.text).toMatch(
        /^\/images\/notion-emoji\/[^/]+$/,
      );
    }
    expect(seen).toBeGreaterThanOrEqual(18);
    for (const [run] of text.matchAll(/"customEmoji":\{[^}]*\}/g)) {
      expect(run).toMatch(/"src":"\/images\/notion-emoji\/[^"]+"/);
    }
  });

  it("feeds the homepage card its seven layers and their At a Glance lines", () => {
    const markup = renderToStaticMarkup(createElement(PersonalSystems));
    const card = markup.slice(
      markup.indexOf('data-systems-layer-index=""'),
      markup.indexOf("data-routine-timeline"),
    );
    for (const layer of layers) {
      expect(card, layer.title).toContain(layer.title.replace(/&/g, "&amp;"));
    }
    // One line per layer from At a Glance, first letter up, hook dropped.
    expect(card).toContain(
      "Who I am, what I believe, and the cues to make it automatic.",
    );
    expect(card).not.toContain("Read more");
  });
});
