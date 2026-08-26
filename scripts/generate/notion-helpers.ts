// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { createWriteStream, existsSync } from "fs";
import http from "http";
import https from "https";
import { join } from "path";

// ─── Rich Text Helpers ───

export function transformRichText(rt: any[]): any[] {
  return (rt ?? []).map((r) => {
    const out: any = { text: r.plain_text };
    if (r.annotations?.bold) out.bold = true;
    if (r.annotations?.italic) out.italic = true;
    if (r.annotations?.code) out.code = true;
    if (r.annotations?.color && r.annotations.color !== "default")
      out.color = r.annotations.color;
    if (r.href) out.link = cleanUrl(r.href);
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
      return { type: "image", src: localPath, alt: caption || "Image" };
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
};

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
  // www.notion.so/<id> is the legacy format, app.notion.com/p/<id> the current one
  const selfPagePattern = new RegExp(
    `https://(?:www\\.notion\\.so/|app\\.notion\\.com/p/)${pageId}#([a-f0-9]+)`,
  );
  const rewrite = (value: any): any => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") {
      const result: any = {};
      for (const [key, v] of Object.entries(value)) {
        if (key === "link" && typeof v === "string") {
          const match = selfPagePattern.exec(v);
          result[key] = (match?.[1] && anchorMap[match[1]]) || v;
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
        // Notion links arrive as www.notion.so/<slug>-<id> or app.notion.com/p/<id>
        const isNotionLink =
          /https:\/\/(www\.notion\.so|app\.notion\.com)\//.test(value);
        const match = isNotionLink ? /([a-f0-9]{32})/.exec(value) : null;
        if (match?.[1] && notionPageToUrl[match[1]]) {
          result[key] = notionPageToUrl[match[1]];
        } else {
          result[key] = value;
        }
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
