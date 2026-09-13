import { anchorSlug, uniqueAnchor } from "../../src/lib/anchors";
import { localizeMusingLinks } from "../../src/lib/musings/links";
import {
  type MusingArticle,
  type MusingBlock,
  type MusingImage,
  type MusingText,
  musingBlockText,
  musingPath,
  safeMusingLink,
  validMusingSlug,
} from "../../src/lib/musings/types";
import { writePublicSearchIndexArtifact } from "../../src/lib/universal-search/public-index-artifact";
import type {
  PageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import { type BlockTree, notionClient, queryPages, readBlocks } from "./notion";

export function propertyText(page: PageObjectResponse, name: string) {
  const p = page.properties[name];
  return p && (p.type === "title" || p.type === "rich_text")
    ? (p.type === "title" ? p.title : p.rich_text)
        .map((r) => r.plain_text)
        .join("")
        .trim()
    : "";
}
export function isPublishedMusing(page: PageObjectResponse, now = new Date()) {
  const p = page.properties;
  if (
    page.archived ||
    page.in_trash ||
    p.Musing?.type !== "checkbox" ||
    !p.Musing.checkbox ||
    p.Status?.type !== "status" ||
    p.Status.status?.name !== "Posted"
  )
    return false;
  const date = p.Date?.type === "date" ? p.Date.date?.start : undefined;
  if (!date || !Number.isFinite(Date.parse(date)))
    throw new Error("A posted Musing needs an original publication Date");
  return Date.parse(date) <= now.getTime();
}

/** Only an authored revision date belongs in reader-facing metadata. Notion's
 * last_edited_time also changes for imports, property edits, and cleanup. */
export function editorialUpdatedAt(
  page: PageObjectResponse,
  publishedAt: string,
  now = new Date(),
) {
  const property = page.properties.Updated;
  const value = property?.type === "date" ? property.date?.start : undefined;
  if (!value) return publishedAt;
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    timestamp < Date.parse(publishedAt.slice(0, 10)) ||
    timestamp > now.getTime()
  ) {
    throw new Error(
      "Updated must be an editorial revision date between publication and today",
    );
  }
  return value;
}
function text(runs: RichTextItemResponse[]): MusingText[] {
  return runs.map((r) => ({
    text: r.plain_text,
    ...(r.annotations.bold ? { bold: true } : {}),
    ...(r.annotations.italic ? { italic: true } : {}),
    ...(r.annotations.underline ? { underline: true } : {}),
    ...(r.annotations.strikethrough ? { strikethrough: true } : {}),
    ...(r.annotations.code ? { code: true } : {}),
    ...(r.href && safeMusingLink(r.href) ? { link: r.href } : {}),
  }));
}
export async function convertBlocks(
  blocks: BlockTree[],
  image: (url: string, alt: string) => Promise<MusingImage>,
  anchors = new Set<string>(),
): Promise<MusingBlock[]> {
  const result: MusingBlock[] = [];
  for (const block of blocks) {
    const children = block.children
      ? await convertBlocks(block.children, image, anchors)
      : undefined;
    switch (block.type) {
      case "paragraph":
      case "quote":
      case "bulleted_list_item":
      case "numbered_list_item":
        result.push({
          type: block.type,
          content: text(
            (block.type === "paragraph"
              ? block.paragraph
              : block.type === "quote"
                ? block.quote
                : block.type === "bulleted_list_item"
                  ? block.bulleted_list_item
                  : block.numbered_list_item
            ).rich_text,
          ),
          ...(children?.length ? { children } : {}),
        });
        break;
      case "heading_1":
      case "heading_2":
      case "heading_3": {
        const content = text(
          (block.type === "heading_1"
            ? block.heading_1
            : block.type === "heading_2"
              ? block.heading_2
              : block.heading_3
          ).rich_text,
        );
        result.push({
          type: "heading",
          level: block.type === "heading_3" ? 3 : 2,
          content,
          id: uniqueAnchor(
            anchorSlug(content.map((r) => r.text).join("")) || "section",
            anchors,
          ),
        });
        if (children?.length) result.push(...children);
        break;
      }
      case "image": {
        const file = block.image;
        const url =
          file.type === "external"
            ? file.external.url
            : file.type === "file"
              ? file.file.url
              : null;
        if (!url) throw new Error("Image has no downloadable URL");
        const caption = text(file.caption);
        result.push({
          type: "image",
          image: await image(url, caption.map((r) => r.text).join("")),
          caption,
        });
        break;
      }
      case "bookmark":
      case "embed":
      case "link_preview": {
        const value =
          block.type === "bookmark"
            ? block.bookmark
            : block.type === "embed"
              ? block.embed
              : block.link_preview;
        const url = safeMusingLink(value.url);
        if (!url) throw new Error("Unsupported link protocol");
        const caption =
          block.type === "bookmark"
            ? block.bookmark.caption
            : block.type === "embed"
              ? block.embed.caption
              : [];
        result.push({
          type: "link",
          url,
          content: caption.length
            ? text(caption)
            : [{ text: new URL(url).hostname }],
        });
        break;
      }
      case "video": {
        if (block.video.type !== "external")
          throw new Error(
            "Upload video to a video host before syncing this Musing",
          );
        const source = new URL(block.video.external.url);
        const youtube =
          /(^|\.)youtube.com$/.test(source.hostname) &&
          source.pathname.startsWith("/embed/");
        const url = youtube
          ? `https://www.youtube.com/watch?v=${source.pathname.split("/")[2]}`
          : source.href;
        result.push({
          type: "link",
          url,
          content: block.video.caption.length
            ? text(block.video.caption)
            : [{ text: "Watch the video" }],
        });
        break;
      }
      case "divider":
        result.push({ type: "divider" });
        break;
      case "code":
        result.push({
          type: "code",
          text: block.code.rich_text.map((r) => r.plain_text).join(""),
          language: block.code.language,
        });
        break;
      case "toggle":
        result.push({
          type: "toggle",
          content: text(block.toggle.rich_text),
          children: children ?? [],
        });
        break;
      case "callout":
        result.push({
          type: "quote",
          content: text(block.callout.rich_text),
          ...(children?.length ? { children } : {}),
        });
        break;
      case "column_list":
      case "column":
        result.push(...(children ?? []));
        break;
      default:
        throw new Error(
          `Unsupported Musing block: ${block.type}. The previous snapshot was kept.`,
        );
    }
  }
  return result;
}

export async function syncMusings() {
  const root = process.cwd();
  const notion = notionClient();
  const pages = await queryPages(notion, true);
  const previousFile = join(root, "content/musings/articles.json");
  const articles: MusingArticle[] = [];
  const assetDir = join(root, "public/images/musings");
  await mkdir(assetDir, { recursive: true });
  const seen = new Set<string>();
  for (const page of pages) {
    if (!isPublishedMusing(page)) continue;
    const slug = propertyText(page, "Slug");
    const title = propertyText(page, "Title");
    if (!validMusingSlug(slug) || !title || seen.has(slug))
      throw new Error(
        "Each posted Musing needs a title and unique Slug using lowercase words separated by hyphens",
      );
    seen.add(slug);
    const download = async (url: string, alt: string): Promise<MusingImage> => {
      // Notion file URLs expire. Persist bytes, never signed URLs, in artifacts.
      if (new URL(url).protocol !== "https:")
        throw new Error(`Non-HTTPS image in ${slug}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok)
        throw new Error(
          `Image download failed (${response.status}) in ${slug}`,
        );
      const bytes = Buffer.from(await response.arrayBuffer());
      const digest = createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 20);
      const output = await sharp(bytes, { animated: true })
        .rotate()
        .resize({ width: 2400, withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
      const filename = `${digest}.webp`;
      await writeFile(join(assetDir, filename), output.data);
      const metadata = await sharp(output.data).metadata();
      return {
        src: `/images/musings/${filename}`,
        width: output.info.width,
        height: metadata.pageHeight ?? output.info.height,
        alt,
      };
    };
    const blocks = await convertBlocks(
      await readBlocks(notion, page.id),
      download,
    );
    const plain = musingBlockText(blocks);
    if (!plain.trim()) throw new Error(`Empty article: ${slug}`);
    const date = page.properties.Date;
    const publishedAt = date?.type === "date" ? date.date!.start : "";
    const medium = page.properties["Medium URL"];
    const mediumUrl = medium?.type === "url" ? medium.url : null;
    const description =
      propertyText(page, "Summary") || plain.replace(/\s+/g, " ").slice(0, 220);
    const author = propertyText(page, "Author") || "Chappy Asel";
    const contentHash = createHash("sha256")
      .update(JSON.stringify({ title, description, author, blocks }))
      .digest("hex");
    const updatedAt = editorialUpdatedAt(page, publishedAt);
    const cover = blocks.find((b) => b.type === "image")?.image ?? null;
    articles.push({
      slug,
      title,
      description,
      author,
      publishedAt,
      updatedAt,
      mediumUrl,
      cover,
      blocks,
      text: plain,
      contentHash,
    });
    console.log(`Synced ${slug}: ${blocks.length} blocks`);
  }
  articles.sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
  const mediumSlugs = new Map<string, string>();
  for (const article of articles) {
    const id = article.mediumUrl?.match(/-([a-f0-9]{12})$/)?.[1];
    if (id) mediumSlugs.set(id, article.slug);
  }
  for (const article of articles)
    article.blocks = localizeMusingLinks(article.blocks, mediumSlugs);
  // AI Collective's separately hosted essay remains an explicit external entry.
  const external = JSON.parse(
    await readFile(join(root, "content/musings/external.json"), "utf8"),
  ) as { items: Record<string, unknown>[] };
  const items = [
    ...external.items,
    ...articles.map((a) => ({
      title: a.title,
      pubDate: a.publishedAt,
      link: musingPath(a.slug),
      guid: musingPath(a.slug),
      author: a.author,
      thumbnail: a.cover?.src ?? "",
      thumbnailWidth: a.cover?.width ?? 1200,
      thumbnailHeight: a.cover?.height ?? 630,
      description: a.description,
      searchText: a.text,
      source: "Musings",
    })),
  ];
  const outputs = [
    [previousFile, articles],
    [join(root, "public/data/blog-posts.json"), { items }],
  ] as const;
  for (const [file, value] of outputs) {
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  }
  for (const [file] of outputs) await rename(`${file}.tmp`, file);
  await writePublicSearchIndexArtifact(root);
  console.log(
    `Saved ${articles.length} published Musings and refreshed site search.`,
  );
}
