import { existsSync } from "fs";
import { join } from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import rawData from "~~/data/systems.json";

import { bookSlugFromUrl } from "~/lib/books/inlineFacts";
import { sitePageForHref } from "~/lib/site/pages";

import SystemsSection from "./components/SystemsSection";
import RichTextRenderer from "~/components/notion/RichTextRenderer";
import {
  STATUS_BY_NOTION_COLOR,
  SYSTEM_STATUS_LABEL,
} from "~/components/notion/systemStatus";
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

    // 2026-09-09 rewrite: the opening paragraph links the manual and the
    // Hamming quote's book; the 7 Habits origin moved into At a Glance's
    // "Origin story" dropdown.
    const links = [...runs(data.intro)].map((r) => r.link).filter(Boolean);
    expect(links).toContain("https://www.chappyasel.com/manual");
    expect(links).toContain(
      "https://books.chappyasel.com/the-art-of-doing-science-and-engineering",
    );
    expect(links).toContain("#tips-for-getting-started");
    expect(links).toContain("#further-reading");

    const glance = section("at-a-glance");
    const origin = glance?.blocks?.find(
      (b) => b.type === "toggle" && /^origin story/i.test(plain(b.title)),
    );
    expect(origin?.type).toBe("toggle");
    if (origin?.type !== "toggle") return;
    expect([...runs(origin.children)].map((r) => r.link)).toContain(
      "https://books.chappyasel.com/7-habits-of-highly-effective-people",
    );
  });

  it("keeps the four sections the site styles by id", () => {
    // sectionIcons.tsx keys on these ids (the OG card draws only the layers).
    // A new or renamed section is a deliberate change there, not a sync.
    expect(data.sections.map((s) => s.id)).toEqual([
      "at-a-glance",
      "the-seven-layers",
      "considerations",
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
    // The rhythm lives in daylight.css; the markup only flags the lists.
    expect(markup).toMatch(/<ol[^>]*data-relaxed=""/);
    expect(markup).toMatch(/<ul[^>]*data-relaxed=""/);
  });

  it("turns the hand-numbered getting-started dropdowns into a numbered list of dropdowns", () => {
    const tips = section("tips-for-getting-started");
    const list = tips?.blocks?.find((b) => b.type === "numbered_list");
    expect(list?.type).toBe("numbered_list");
    if (list?.type !== "numbered_list") return;
    expect(list.items).toHaveLength(5);
    for (const item of list.items) {
      const first = item[0];
      expect(first?.type).toBe("toggle");
      if (first?.type !== "toggle") continue;
      // The owner's "1. " prefix is the signal, not part of the title.
      expect(plain(first.title)).not.toMatch(/^\s*\d+[.)]\s/);
      expect(first.children.length).toBeGreaterThan(0);
    }
    const markup = renderToStaticMarkup(
      createElement(SystemsSection, { section: tips! }),
    );
    // Five list items, each opening with a dropdown that draws its own
    // number on the title's line (the native marker would sit low).
    expect(
      markup.match(/<li class="list-none"><div id="[^"]+" data-notion-toggle/g),
    ).toHaveLength(5);
    expect(markup.match(/data-notion-toggle-marker=""/g)).toHaveLength(5);
    expect(markup).toContain(">3.</span>");
  });

  it("preserves the 53 dropdowns with their nested bodies", () => {
    // 47 across the seven layers, At a Glance's origin story, and the five
    // numbered getting-started steps. The Considerations are a numbered
    // list of twelve, not dropdowns.
    const toggles = [...walk(everyBlock)].filter((b) => b.type === "toggle");
    expect(toggles).toHaveLength(53);
    const considerations = section("considerations");
    const list = considerations?.blocks?.find(
      (b) => b.type === "numbered_list",
    );
    expect(list?.type === "numbered_list" ? list.items.length : 0).toBe(12);
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

  it("lifts a dropdown's status colour into a status and off its words", () => {
    const toggles = [...walk(layers.flatMap((l) => l.blocks))].filter(
      (b) => b.type === "toggle",
    );
    const statusColors = new Set(Object.keys(STATUS_BY_NOTION_COLOR));
    for (const toggle of toggles) {
      if (toggle.type !== "toggle") continue;
      for (const run of toggle.title) {
        expect(
          run.color !== undefined && statusColors.has(run.color),
          plain(toggle.title),
        ).toBe(false);
      }
    }
    // The owner's colours on the public doc (2026-09-09): 20 of the 47
    // dropdowns carry a state; the other 27 are live and carry none.
    const counts: Record<string, number> = {};
    for (const toggle of toggles) {
      if (toggle.type !== "toggle" || !toggle.status) continue;
      counts[toggle.status] = (counts[toggle.status] ?? 0) + 1;
    }
    expect(counts).toEqual({
      implementing: 6,
      partial: 4,
      next: 3,
      "not-yet": 7,
    });
    const worldModel = toggles.find(
      (t) => t.type === "toggle" && plain(t.title).includes("World Model"),
    );
    expect(worldModel?.type === "toggle" ? worldModel.status : null).toBe(
      "implementing",
    );
  });

  it("draws a status as a named dot after the system's name", () => {
    const seven = section("the-seven-layers");
    expect(seven).toBeDefined();
    if (!seven) return;
    const markup = renderToStaticMarkup(
      createElement(SystemsSection, { section: seven }),
    );
    expect(markup).toContain('data-system-status="implementing"');
    expect(markup).toContain(SYSTEM_STATUS_LABEL.implementing);
    // The dot sits after the system's name, before the arrow.
    const worldModel = markup.slice(markup.indexOf("World Model"));
    const dotAt = worldModel.indexOf("data-system-status=");
    const arrowAt = worldModel.indexOf("data-notion-toggle-arrow=");
    expect(dotAt).toBeGreaterThan(0);
    expect(arrowAt).toBeGreaterThan(dotAt);
    // No legend: the dot's tooltip is the only place a state is named.
    expect(markup).not.toContain("data-systems-status-legend");
  });

  it("starts Further Reading folded and every other section open", () => {
    for (const s of data.sections) {
      const markup = renderToStaticMarkup(
        createElement(SystemsSection, { section: s }),
      );
      const open = s.id !== "further-reading";
      expect(markup, s.id).toContain(`aria-expanded="${open}"`);
      expect(markup, s.id).toContain(`data-open="${open}"`);
    }
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

  it("names a bare library link the way the other site pages are named", () => {
    // Notion stores the Book Notes row as a link mention whose text is the
    // URL; the manual and routine rows carry their full page titles. The
    // bare link takes the page's title so the three read alike.
    const seven = section("the-seven-layers");
    expect(seven).toBeDefined();
    if (!seven) return;
    const markup = renderToStaticMarkup(
      createElement(SystemsSection, { section: seven }),
    );
    const every = markup.match(/Book Notes/g)?.length ?? 0;
    const named = markup.match(/Chappy’s Book Notes/g)?.length ?? 0;
    expect(named).toBeGreaterThan(0);
    expect(every).toBe(named);
  });

  it("gives every dropdown a page-unique anchor a link can land on", () => {
    const toggles = [...walk(everyBlock)].filter((b) => b.type === "toggle");
    const ids = toggles.map((t) => (t.type === "toggle" ? t.id : undefined));
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
      true,
    );
    expect(new Set(ids).size).toBe(ids.length);
    const reserved = new Set(
      data.sections.flatMap((s) => [
        s.id,
        ...(s.layers ?? []).map((l) => l.id),
      ]),
    );
    for (const id of ids) expect(reserved.has(id!), id).toBe(false);
    expect(ids).toContain("deep-think-weeks");
    expect(ids).toContain("world-model");
    expect(ids).toContain("book-notes");
    expect(ids).toContain("log-a-daily-scorecard");

    // Content headings (the Domain Systems group labels) are anchored too,
    // unique against the dropdowns.
    const headings = [...walk(everyBlock)].filter((b) => b.type === "heading");
    const headingIds = headings.map((h) =>
      h.type === "heading" ? h.id : undefined,
    );
    expect(
      headingIds.every((id) => typeof id === "string" && id.length > 0),
    ).toBe(true);
    expect(headingIds).toContain("knowledge");
    expect(new Set([...ids, ...headingIds]).size).toBe(
      ids.length + headingIds.length,
    );

    const seven = section("the-seven-layers");
    const markup = renderToStaticMarkup(
      createElement(SystemsSection, { section: seven! }),
    );
    expect(markup).toContain('id="deep-think-weeks"');
    expect(markup).toMatch(/<h3[^>]*id="knowledge"/);
  });

  it("stores every picture at a sane size with its dimensions recorded", () => {
    const images = [...walk(everyBlock)].filter((b) => b.type === "image");
    expect(images.length).toBeGreaterThanOrEqual(1);
    for (const image of images) {
      if (image.type !== "image") continue;
      expect(image.src).toMatch(/^\/images\/systems\/[^/]+$/);
      expect(existsSync(join(process.cwd(), "public", image.src))).toBe(true);
      expect(image.width, image.src).toBeGreaterThan(0);
      expect(image.width, image.src).toBeLessThanOrEqual(2400);
      expect(image.height, image.src).toBeGreaterThan(0);
    }
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
