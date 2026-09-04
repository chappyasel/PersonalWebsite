// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { createWriteStream, existsSync, mkdirSync } from "fs";
import http from "http";
import https from "https";
import { join } from "path";

import sharp from "sharp";

// ─── Rich Text Helpers ───

// Workspace emoji seen during a run: name → remote file URL. Filled by
// transformRichText, drained by downloadCustomEmoji.
const customEmojiRegistry = new Map<string, string>();

export function transformRichText(rt: any[]): any[] {
  return (rt ?? []).map((r) => {
    const out: any = { text: r.plain_text };
    if (r.annotations?.bold) out.bold = true;
    if (r.annotations?.italic) out.italic = true;
    if (r.annotations?.code) out.code = true;
    if (r.annotations?.color && r.annotations.color !== "default")
      out.color = r.annotations.color;
    if (r.href) out.link = cleanUrl(r.href);
    if (r.type === "mention" && r.mention?.type === "custom_emoji") {
      // A workspace emoji (":sunsama:") is a mention whose plain text is the
      // shortcode. Remember the file so the run can carry a local path once
      // downloadCustomEmoji has fetched it (see resolveCustomEmoji).
      const { name, url } = r.mention.custom_emoji ?? {};
      if (name && url) {
        customEmojiRegistry.set(name, url);
        out.customEmoji = { name };
      }
    }
    return out;
  });
}

export function richTextToPlain(rt: any[]): string {
  return (rt ?? []).map((r) => r.plain_text).join("");
}

// ─── URL & Image Helpers ───

export function cleanUrl(url: string): string {
  if (url.includes("google.com/url")) {
    try {
      const u = new URL(url);
      const target = u.searchParams.get("q") ?? u.searchParams.get("url");
      if (target) return target;
    } catch {}
  }
  return url;
}

export function getImageExtension(url: string): string {
  try {
    const u = new URL(url);
    const ext = u.pathname.split(".").pop()?.split("?")[0]?.toLowerCase();
    if (ext && ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
      return ext;
  } catch {}
  return "png";
}

export function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod
      .get(url, { headers: { "User-Agent": "NotionExport/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          downloadFile(res.headers.location!, dest)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const stream = createWriteStream(dest);
        res.pipe(stream);
        stream.on("finish", () => {
          stream.close();
          resolve();
        });
        stream.on("error", reject);
      })
      .on("error", reject);
  });
}

// ─── Custom Emoji ───
//
// Both synced pages share one folder, so an emoji used on both is stored
// once. The file keeps Notion's name (":sunsama:" → sunsama.png).

export async function downloadCustomEmoji(
  emojiDir: string,
  emojiPathPrefix: string,
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  if (customEmojiRegistry.size === 0) return resolved;
  mkdirSync(emojiDir, { recursive: true });
  for (const [name, url] of customEmojiRegistry) {
    const filename = `${name}.${getImageExtension(url)}`;
    const dest = join(emojiDir, filename);
    if (!existsSync(dest)) {
      try {
        await downloadFile(url, dest);
        console.log(`  Downloaded custom emoji: ${filename}`);
      } catch (err) {
        console.warn(`  Failed to download custom emoji :${name}:`, err.message);
        continue;
      }
    }
    resolved[name] = `${emojiPathPrefix}${filename}`;
  }
  return resolved;
}

/**
 * Stamp the downloaded path onto every rich-text run that names a custom
 * emoji. A run whose file failed to download loses the marker and renders as
 * its ":name:" text, which is what Notion's own export shows.
 */
export function resolveCustomEmoji(
  obj: any,
  resolved: Record<string, string>,
): any {
  if (Array.isArray(obj)) return obj.map((v) => resolveCustomEmoji(v, resolved));
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "customEmoji" && value && typeof value === "object") {
        const src = resolved[(value as any).name];
        if (src) result[key] = { ...(value as any), src };
      } else {
        result[key] = resolveCustomEmoji(value, resolved);
      }
    }
    return result;
  }
  return obj;
}

// ─── Image Inversion ───
//
// The pages hang images as framed prints, and in dark mode a diagram drawn
// black-on-white glows. Line art can simply be inverted at render time; a
// photograph cannot. The sync decides per image from the pixels, and a
// caption token overrides it either way: "[invert]" or "[no-invert]" (the
// token is stripped from the alt text).

const INVERT_TOKEN = /\s*\[(no-)?invert\]\s*/i;

async function imageInvertible(
  path: string,
  caption: string,
): Promise<boolean> {
  const forced = INVERT_TOKEN.exec(caption);
  if (forced) return !forced[1];
  return looksLikeLineArt(path);
}

/**
 * Two kinds of picture want inverting in dark mode.
 *
 * Ink on a light ground: most pixels are near white, and almost none are
 * desaturated mid-tones. Charts, diagrams, and coloured bars on white are
 * white plus ink; a photograph is full of mid-tone greys (skin, shadow,
 * fabric) even when it is bright. Counting colours does not separate the
 * two, because anti-aliased edges give a small graphic as many colours as
 * a photo; the mid-tone share does.
 *
 * Dark marks on a transparent canvas: black strokes that vanish against a
 * dark mat. Here the transparent pixels are the ground, so the test is on
 * the marks alone, and only dark marks qualify; coloured or grey marks
 * already read on a dark mat and are left as drawn.
 *
 * Strokes thin out under the downscale, so any pixel with visible alpha
 * counts as a mark.
 */
async function looksLikeLineArt(path: string): Promise<boolean> {
  try {
    const { data, info } = await sharp(path)
      .resize(96, 96, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = info.width * info.height;
    if (pixels === 0) return false;

    let light = 0;
    let dark = 0;
    let midGrey = 0;
    let transparent = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const a = data[i + 3];
      if (a < 32) {
        transparent++;
        continue;
      }
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (min >= 200) light++;
      if (max < 96) dark++;
      if (max >= 90 && max < 200 && max - min < 48) midGrey++;
    }
    const marks = pixels - transparent;
    if (marks === 0) return false;

    if (transparent / pixels >= 0.3) return dark / marks >= 0.5;
    return light / marks >= 0.5 && midGrey / marks <= 0.2;
  } catch (err) {
    console.warn(`  Could not analyse ${path}:`, err.message);
    return false;
  }
}

// ─── Block Walking ───

export async function fetchChildren(
  blockId: string,
  notion: any,
): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return blocks;
}

export async function walkBlocks(
  blockId: string,
  notion: any,
): Promise<any[]> {
  const blocks = await fetchChildren(blockId, notion);
  for (const block of blocks) {
    if (block.has_children) {
      block._children = await walkBlocks(block.id, notion);
    }
  }
  return blocks;
}

// ─── Block Transformation ───

export async function transformBlock(
  block: any,
  imagesDir: string,
  imagePathPrefix: string,
): Promise<any | null> {
  const type = block.type;

  switch (type) {
    case "paragraph": {
      const content = transformRichText(block.paragraph.rich_text);
      if (content.length === 0) return null;
      return { type: "paragraph", content };
    }

    case "heading_1":
      return {
        type: "heading",
        level: 2,
        content: transformRichText(block.heading_1.rich_text),
        _raw_text: richTextToPlain(block.heading_1.rich_text),
        _has_children: block.has_children,
        _children: block._children,
      };

    case "heading_2":
      return {
        type: "heading",
        level: 2,
        content: transformRichText(block.heading_2.rich_text),
      };

    case "heading_3":
      return {
        type: "heading",
        level: 3,
        content: transformRichText(block.heading_3.rich_text),
      };

    case "callout": {
      const children = block._children
        ? await transformBlocks(block._children, imagesDir, imagePathPrefix)
        : [];
      const calloutText = transformRichText(block.callout.rich_text);
      const content =
        calloutText.length > 0
          ? [{ type: "paragraph", content: calloutText }, ...children]
          : children;
      return {
        type: "callout",
        icon: block.callout.icon?.emoji ?? "💡",
        color: block.callout.color ?? "default",
        content,
      };
    }

    case "toggle": {
      const children = block._children
        ? await transformBlocks(block._children, imagesDir, imagePathPrefix)
        : [];
      return {
        type: "toggle",
        title: transformRichText(block.toggle.rich_text),
        children,
      };
    }

    case "bulleted_list_item": {
      const content = transformRichText(block.bulleted_list_item.rich_text);
      const children = block._children
        ? await transformBlocks(block._children, imagesDir, imagePathPrefix)
        : [];
      return { type: "_bulleted_list_item", content, children };
    }

    case "numbered_list_item": {
      const content = transformRichText(block.numbered_list_item.rich_text);
      const children = block._children
        ? await transformBlocks(block._children, imagesDir, imagePathPrefix)
        : [];
      return { type: "_numbered_list_item", content, children };
    }

    case "image": {
      const imgData = block.image;
      const url = imgData.file?.url ?? imgData.external?.url ?? "";
      if (!url) return null;

      const ext = getImageExtension(url);
      const filename = `${block.id}.${ext}`;
      const localPath = `${imagePathPrefix}${filename}`;
      const destPath = join(imagesDir, filename);

      if (!existsSync(destPath)) {
        try {
          await downloadFile(url, destPath);
          console.log(`  Downloaded image: ${filename}`);
        } catch (err) {
          console.warn(
            `  Failed to download image ${block.id}:`,
            err.message,
          );
          return null;
        }
      }

      const caption = richTextToPlain(imgData.caption ?? []);
      const invert = await imageInvertible(destPath, caption);
      const alt = caption.replace(INVERT_TOKEN, "").trim() || "Image";
      return invert
        ? { type: "image", src: localPath, alt, invert: true }
        : { type: "image", src: localPath, alt };
    }

    case "table": {
      return handleTableBlock(block);
    }

    case "divider":
      return { type: "divider" };

    case "quote":
      return {
        type: "quote",
        content: transformRichText(block.quote.rich_text),
      };

    default:
      return null;
  }
}

export async function transformBlocks(
  blocks: any[],
  imagesDir: string,
  imagePathPrefix: string,
): Promise<any[]> {
  const result: any[] = [];

  for (const block of blocks) {
    const transformed = await transformBlock(block, imagesDir, imagePathPrefix);
    if (!transformed) continue;

    if (transformed.type === "_bulleted_list_item") {
      const last = result[result.length - 1];
      const itemBlocks = [
        { type: "paragraph", content: transformed.content },
        ...transformed.children,
      ];
      if (last && last.type === "bulleted_list") {
        last.items.push(itemBlocks);
      } else {
        result.push({ type: "bulleted_list", items: [itemBlocks] });
      }
    } else if (transformed.type === "_numbered_list_item") {
      const last = result[result.length - 1];
      const itemBlocks = [
        { type: "paragraph", content: transformed.content },
        ...transformed.children,
      ];
      if (last && last.type === "numbered_list") {
        last.items.push(itemBlocks);
      } else {
        result.push({ type: "numbered_list", items: [itemBlocks] });
      }
    } else {
      result.push(transformed);
    }
  }

  return result;
}

// ─── Table Handling ───

function handleTableBlock(block: any): any | null {
  if (!block._children) return null;

  const rows = block._children.filter((c: any) => c.type === "table_row");
  if (rows.length === 0) return null;

  const hasHeader = block.table?.has_column_header ?? true;
  const headerRow = hasHeader ? rows[0] : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const headers: string[] = headerRow
    ? headerRow.table_row.cells.map((cell: any) => richTextToPlain(cell).trim())
    : rows[0]?.table_row.cells.map((_: any, i: number) => `Column ${i + 1}`) ??
      [];

  const parsedRows: Array<Record<string, { text: string; link?: string }>> = [];

  for (const row of dataRows) {
    const cells = row.table_row.cells;
    const rowData: Record<string, { text: string; link?: string }> = {};

    for (let j = 0; j < headers.length; j++) {
      const cell = cells[j] ?? [];
      const text = richTextToPlain(cell).trim();
      let link: string | undefined;
      for (const rt of cell) {
        if (rt.href) {
          link = cleanUrl(rt.href);
          break;
        }
      }
      rowData[headers[j]] = { text, link };
    }

    parsedRows.push(rowData);
  }

  return {
    type: "table",
    headers,
    rows: parsedRows,
  };
}

// ─── Utility Helpers ───

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Notion Link Rewriting ───

// Map known Notion page IDs to their public URLs
const notionPageToUrl: Record<string, string> = {
  "151c5ab0d88d80f3a0efcf2e04f18a56": "https://chappyasel.com/routine",
  "253c5ab0d88d80888643c64e7dbe5d0c": "https://chappyasel.com/manual",
  // The Book Notes root page and the Why We Sleep notes both live on the
  // public library.
  "340ec22372464d89a44e8005075bb7c4": "https://books.chappyasel.com/",
  "1a8f4bfb2323462c82aa9c9fffb12186": "https://books.chappyasel.com/why-we-sleep",
};

// Notion Site slugs (chappyasel.notion.site/<slug>) that the site serves
// itself. A slug with no entry (eg. /systems) stays as authored.
const notionSiteToUrl: Record<string, string> = {
  manual: "https://chappyasel.com/manual",
  routine: "https://chappyasel.com/routine",
};

function rewritePublicNotionUrl(value: string): string {
  // Notion links arrive as www.notion.so/<slug>-<id> or app.notion.com/p/<id>
  const isNotionLink =
    /https:\/\/(www\.notion\.so|app\.notion\.com)\//.test(value);
  const page = isNotionLink ? /([a-f0-9]{32})/.exec(value) : null;
  if (page?.[1] && notionPageToUrl[page[1]]) return notionPageToUrl[page[1]];

  const site =
    /^https:\/\/chappyasel\.notion\.site\/([a-z0-9-]+)\/?(?:[?#].*)?$/i.exec(
      value,
    );
  const slug = site?.[1]?.toLowerCase();
  if (slug && notionSiteToUrl[slug]) return notionSiteToUrl[slug];

  return value;
}

/**
 * Collect the IDs (dashes stripped, as they appear in URL fragments) of a
 * block and all of its fetched descendants.
 */
export function collectBlockIds(block: any): string[] {
  const ids: string[] = [];
  const stack: any[] = [block];
  while (stack.length > 0) {
    const b = stack.pop();
    if (typeof b?.id === "string") ids.push(b.id.replace(/-/g, ""));
    if (Array.isArray(b?._children)) stack.push(...b._children);
  }
  return ids;
}

/**
 * Rewrite links pointing at the page itself to local section anchors.
 * anchorMap keys are Notion block IDs without dashes (as found in URL
 * fragments); values are anchors like "#caffeine". Runs before
 * rewriteNotionPageLinks so self-links with a known fragment stay on-page.
 */
export function rewriteNotionSelfLinks(
  obj: any,
  pageId: string,
  anchorMap: Record<string, string>,
): any {
  // Self-links arrive in three shapes: www.notion.so/<id>#<block>,
  // app.notion.com/p/<id>#<block>, and, for links typed into the page rather
  // than @-mentions, app.notion.com/p/<workspace>/<slug>-<id>#<block>. Any
  // Notion URL whose path ends in this page's id is one.
  const selfPagePattern = new RegExp(
    `^https://(?:www\\.notion\\.so|app\\.notion\\.com)/(?:[^#?]*[-/])?${pageId}(?:\\?[^#]*)?#([a-f0-9]+)$`,
  );
  const rewrite = (value: any): any => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") {
      const result: any = {};
      for (const [key, v] of Object.entries(value)) {
        if (key === "link" && typeof v === "string") {
          const match = selfPagePattern.exec(v);
          if (!match) {
            result[key] = v;
          } else if (match[1] && anchorMap[match[1]]) {
            result[key] = anchorMap[match[1]];
          } else {
            // A fragment with no local home (a block that was deleted, or
            // one outside every section) must not send a visitor off to
            // Notion: keep the words, drop the link.
            console.warn(
              `  Dropped self-link to block ${match[1]}: no section owns it`,
            );
          }
        } else {
          result[key] = rewrite(v);
        }
      }
      return result;
    }
    return value;
  };
  return rewrite(obj);
}

export function rewriteNotionPageLinks(obj: any): any {
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(rewriteNotionPageLinks);
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "link" && typeof value === "string") {
        result[key] = rewritePublicNotionUrl(value);
      } else {
        result[key] = rewriteNotionPageLinks(value);
      }
    }
    return result;
  }
  return obj;
}

export function extractEmojiAndTitle(text: string): {
  icon: string;
  title: string;
} {
  const emojiMatch = text.match(
    /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u,
  );
  if (emojiMatch) {
    return {
      icon: emojiMatch[1],
      title: text.slice(emojiMatch[0].length).trim(),
    };
  }
  return { icon: "📌", title: text.trim() };
}
