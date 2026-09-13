import { readFile, writeFile } from "node:fs/promises";

import type { MediumArticle } from "./medium";
import { notionClient, queryPages, readBlocks } from "./notion";
import { propertyText } from "./sync";

const plan = JSON.parse(
  await readFile("data/musings-import/plan.json", "utf8"),
) as MediumArticle[];
const notion = notionClient();
const pages = await queryPages(notion, true);
const report: {
  slug: string;
  blocks: number;
  images: number;
  pageId: string;
}[] = [];
function payload(block: object, type: string) {
  return (
    block as Record<
      string,
      {
        rich_text?: Array<{
          text?: { content: string; link?: { url: string } | null };
          annotations?: Record<string, unknown>;
        }>;
        caption?: Array<{ text?: { content: string } }>;
        url?: string;
      }
    >
  )[type]!;
}
function normalizedLink(value?: string | null) {
  if (!value) return null;
  const url = new URL(value);
  // Notion strips its own share-view tracking parameter when saving links.
  if (url.hostname === "www.notion.so" || url.hostname === "notion.so")
    url.searchParams.delete("pvs");
  url.search = url.searchParams.toString();
  return url.href;
}
for (const article of plan) {
  const matching = pages.filter((p) => {
    const value = p.properties["Medium URL"];
    return value?.type === "url" && value.url === article.mediumUrl;
  });
  if (matching.length !== 1)
    throw new Error(`Expected one published Notion page for ${article.slug}`);
  const page = matching[0]!;
  if (
    propertyText(page, "Slug") !== article.slug ||
    propertyText(page, "Title") !== article.title
  )
    throw new Error(`Metadata differs: ${article.slug}`);
  const date = page.properties.Date;
  // Notion date properties retain minute precision, dropping seconds.
  if (
    date?.type !== "date" ||
    Math.floor(Date.parse(date.date!.start) / 60000) !==
      Math.floor(Date.parse(article.publishedAt) / 60000)
  )
    throw new Error(`Original date differs: ${article.slug}`);
  const blocks = await readBlocks(notion, page.id);
  if (blocks.length !== article.blocks.length)
    throw new Error(`Block count differs: ${article.slug}`);
  let images = 0;
  for (let i = 0; i < blocks.length; i++) {
    const actual = blocks[i]!,
      expected = article.blocks[i]!;
    if (actual.type !== expected.type)
      throw new Error(`Block type differs: ${article.slug}/${i}`);
    const a = payload(actual, actual.type),
      e = payload(expected, actual.type);
    const content = (runs: typeof a.rich_text) =>
      runs?.map((r) => r.text?.content ?? "").join("") ?? "";
    if (
      content(a.rich_text) !== content(e.rich_text) ||
      content(a.caption) !== content(e.caption) ||
      a.url !== e.url
    )
      throw new Error(`Text, caption, or link differs: ${article.slug}/${i}`);
    if (a.rich_text && e.rich_text) {
      for (let j = 0; j < e.rich_text.length; j++) {
        const ar = a.rich_text[j]!,
          er = e.rich_text[j]!;
        if (
          normalizedLink(ar.text?.link?.url) !==
          normalizedLink(er.text?.link?.url)
        )
          throw new Error(`Inline link differs: ${article.slug}/${i}/${j}`);
        for (const annotation of [
          "bold",
          "italic",
          "code",
          "underline",
          "strikethrough",
        ])
          if (
            Boolean(ar.annotations?.[annotation]) !==
            Boolean(er.annotations?.[annotation])
          )
            throw new Error(`Formatting differs: ${article.slug}/${i}/${j}`);
      }
    }
    if (actual.type === "image") {
      images++;
      if (actual.image.type !== "file")
        throw new Error(`Image still hosted externally: ${article.slug}`);
    }
  }
  report.push({
    slug: article.slug,
    blocks: blocks.length,
    images,
    pageId: page.id,
  });
  console.log(
    `Verified text, formatting, links, images, and date: ${article.slug}`,
  );
}
await writeFile(
  "data/musings-import/verification.json",
  JSON.stringify(report, null, 2),
);
console.log(
  `Verified ${report.length} essays with ${report.reduce((n, a) => n + a.images, 0)} Notion-hosted images.`,
);
