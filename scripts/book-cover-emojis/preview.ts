/**
 * Two previews, for two different questions.
 *
 * The contact sheet answers "does this read as an emoji?" — it shows a dozen
 * jackets spread across the library's color range at the sizes a picker and a
 * message actually use, 20 px and 32 px, next to larger samples for the
 * detail. Each swatch sits on a checkerboard so the transparent square is
 * visible rather than assumed.
 *
 * The HTML catalog answers "did every book come out right?" — all of them,
 * failures included, in one scrollable page opened from the filesystem.
 */
import type { AssetEntry, Manifest } from "./manifest";
import { orderByCoverColor } from "../../src/lib/books/coverColor";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

/** Sizes drawn on the sheet. The first two are the ones that have to work. */
export const SAMPLE_SIZES = [20, 32, 48, 64, 128] as const;
export const CONTACT_SHEET_COUNT = 12;

const SHEET_WIDTH = 940;
const ROW_HEIGHT = 152;
const HEADER_HEIGHT = 108;
const FOOTER_HEIGHT = 56;
const FIRST_COLUMN_X = 470;
const COLUMN_GAP = 28;

const PAPER = "rgb(245,245,245)";
const INK = "rgb(64,64,64)";
const MUTED = "rgb(115,115,115)";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Left edge of each sample column, laid out once and reused by both passes. */
export function columnPositions(): number[] {
  const positions: number[] = [];
  let cursor = FIRST_COLUMN_X;
  for (const size of SAMPLE_SIZES) {
    positions.push(cursor);
    cursor += size + COLUMN_GAP;
  }
  return positions;
}

/**
 * A dozen books spread across the shelf's rainbow rather than the first dozen
 * alphabetically, so the sheet shows dark jackets, pale jackets, and the wide
 * and tall aspect ratios together. Deterministic: same catalog, same picks.
 */
export function pickContactSheetAssets(
  assets: readonly AssetEntry[],
  count = CONTACT_SHEET_COUNT,
): AssetEntry[] {
  const rendered = assets.filter((asset) => asset.status === "success");
  if (rendered.length <= count) return [...rendered];
  const ordered = orderByCoverColor(rendered, "asc");
  const picked: AssetEntry[] = [];
  for (let i = 0; i < count; i++) {
    // Evenly spaced through the rainbow, inclusive of both ends.
    const index = Math.round((i * (ordered.length - 1)) / (count - 1));
    const asset = ordered[index];
    if (asset && !picked.includes(asset)) picked.push(asset);
  }
  // Even spacing can land twice on the same book in a short catalog; fill
  // from the remainder so the sheet always shows the requested count.
  for (const asset of ordered) {
    if (picked.length >= count) break;
    if (!picked.includes(asset)) picked.push(asset);
  }
  return picked;
}

function sheetSvg(assets: readonly AssetEntry[], manifest: Manifest): string {
  const height = HEADER_HEIGHT + assets.length * ROW_HEIGHT + FOOTER_HEIGHT;
  const columns = columnPositions();
  const parts: string[] = [];

  parts.push(
    `<rect width="${SHEET_WIDTH}" height="${height}" fill="${PAPER}"/>`,
    `<text x="40" y="46" font-family="Georgia, serif" font-size="24" fill="${INK}">Book cover emojis</text>`,
    `<text x="40" y="70" font-family="Georgia, serif" font-size="13" fill="${MUTED}">${escapeXml(
      `${manifest.counts.assets.success} of ${manifest.counts.assets.total} books rendered at ${manifest.emoji.size}x${manifest.emoji.size} RGBA, aspect preserved, transparent square`,
    )}</text>`,
    `<text x="40" y="88" font-family="Georgia, serif" font-size="13" fill="${MUTED}">${escapeXml(
      `${manifest.counts.rows.total} source rows, ${manifest.counts.rereadGroups} rereads folded into one emoji each`,
    )}</text>`,
  );

  SAMPLE_SIZES.forEach((size, index) => {
    parts.push(
      `<text x="${columns[index]! + size / 2}" y="${HEADER_HEIGHT - 12}" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="${MUTED}">${size}px</text>`,
    );
  });

  assets.forEach((asset, rowIndex) => {
    const top = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
    const centre = top + ROW_HEIGHT / 2;
    parts.push(
      `<line x1="40" y1="${top}" x2="${SHEET_WIDTH - 40}" y2="${top}" stroke="rgb(225,225,225)" stroke-width="1"/>`,
      `<text x="40" y="${centre - 12}" font-family="Georgia, serif" font-size="16" fill="${INK}">${escapeXml(truncate(asset.title, 44))}</text>`,
      `<text x="40" y="${centre + 8}" font-family="Georgia, serif" font-size="13" fill="${MUTED}">${escapeXml(truncate(asset.author, 44))}</text>`,
      `<text x="40" y="${centre + 28}" font-family="Menlo, monospace" font-size="11" fill="rgb(150,150,150)">${escapeXml(truncate(`${asset.name}.png`, 52))}</text>`,
    );
    // Checkerboard behind each swatch: the pad has to look empty, not white.
    SAMPLE_SIZES.forEach((size, index) => {
      const x = columns[index]!;
      const y = Math.round(centre - size / 2);
      parts.push(
        `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="url(#checker)"/>`,
      );
    });
  });

  parts.push(
    `<text x="40" y="${height - 22}" font-family="Georgia, serif" font-size="12" fill="${MUTED}">${escapeXml(
      "Checkerboard shows the transparent padding around each jacket. Selection walks the shelf's color order.",
    )}</text>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${height}" viewBox="0 0 ${SHEET_WIDTH} ${height}">`,
    `<defs><pattern id="checker" width="12" height="12" patternUnits="userSpaceOnUse">`,
    `<rect width="12" height="12" fill="rgb(237,237,237)"/>`,
    `<rect width="6" height="6" fill="rgb(224,224,224)"/>`,
    `<rect x="6" y="6" width="6" height="6" fill="rgb(224,224,224)"/>`,
    `</pattern></defs>`,
    ...parts,
    `</svg>`,
  ].join("");
}

export async function renderContactSheet(
  assets: readonly AssetEntry[],
  manifest: Manifest,
  emojiDir: string,
): Promise<Buffer> {
  const svg = sheetSvg(assets, manifest);
  const base = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: true, defaultFontFamily: "Georgia" },
  })
    .render()
    .asPng();

  const columns = columnPositions();
  const overlays: sharp.OverlayOptions[] = [];
  for (const [rowIndex, asset] of assets.entries()) {
    if (!asset.file) continue;
    const source = readFileSync(join(emojiDir, asset.file.replace(/^emoji\//, "")));
    const centre = HEADER_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    for (const [index, size] of SAMPLE_SIZES.entries()) {
      overlays.push({
        input: await sharp(source)
          .resize(size, size, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            kernel: "lanczos3",
          })
          .png()
          .toBuffer(),
        left: columns[index]!,
        top: Math.round(centre - size / 2),
      });
    }
  }

  return sharp(base).composite(overlays).png({ compressionLevel: 9 }).toBuffer();
}

export function catalogHtml(manifest: Manifest): string {
  const rows = manifest.assets
    .map((asset) => {
      const src = asset.file ? `../${asset.file}` : null;
      const swatches = src
        ? [20, 32, 64]
            .map(
              (size) =>
                `<img src="${escapeXml(src)}" width="${size}" height="${size}" alt="" loading="lazy">`,
            )
            .join("")
        : `<span class="missing">${escapeXml(asset.error ?? asset.status)}</span>`;
      const ids = asset.notionIds.map((id) => `<code>${escapeXml(id)}</code>`).join(" ");
      return [
        `<tr class="${asset.status === "success" ? "ok" : "bad"}">`,
        `<td class="swatches">${swatches}</td>`,
        `<td><div class="title">${escapeXml(asset.title)}</div><div class="author">${escapeXml(asset.author)}</div><div class="name">${escapeXml(asset.name)}.png</div></td>`,
        `<td class="meta">${asset.readings > 1 ? `${asset.readings} readings` : ""}</td>`,
        `<td class="ids">${ids}</td>`,
        `</tr>`,
      ].join("");
    })
    .join("\n");

  const counts = manifest.counts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Book cover emojis</title>
<style>
  body { background: rgb(245,245,245); color: rgb(64,64,64); font-family: Georgia, serif; margin: 0; padding: 32px; }
  h1 { font-size: 22px; font-weight: normal; margin: 0 0 8px; }
  p { color: rgb(115,115,115); font-size: 13px; max-width: 72ch; line-height: 1.6; margin: 0 0 8px; }
  table { border-collapse: collapse; margin-top: 24px; width: 100%; }
  td { border-top: 1px solid rgb(225,225,225); padding: 10px 12px; vertical-align: middle; }
  .swatches { width: 160px; white-space: nowrap; }
  .swatches img { background-image: linear-gradient(45deg, rgb(224,224,224) 25%, transparent 25%), linear-gradient(-45deg, rgb(224,224,224) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(224,224,224) 75%), linear-gradient(-45deg, transparent 75%, rgb(224,224,224) 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0; vertical-align: middle; margin-right: 10px; }
  .title { font-size: 15px; }
  .author, .name, .meta { color: rgb(115,115,115); font-size: 12px; }
  .name { font-family: Menlo, monospace; color: rgb(150,150,150); }
  .ids code { font-family: Menlo, monospace; font-size: 11px; color: rgb(150,150,150); display: block; }
  tr.bad td { background: rgb(252,244,240); }
  .missing { color: rgb(170,90,60); font-size: 12px; }
</style>
</head>
<body>
<h1>Book cover emojis</h1>
<p>${counts.assets.success} of ${counts.assets.total} books rendered at ${manifest.emoji.size}&times;${manifest.emoji.size} RGBA PNG, aspect preserved, centered in a transparent square. ${counts.rows.total} source rows; ${counts.rereadGroups} books read more than once share one emoji.</p>
<p>${escapeXml(manifest.source.coverageCaveat)}</p>
<p>Generated ${escapeXml(manifest.generatedAt)}. Nothing here has been uploaded to Notion.</p>
<table>
${rows}
</table>
</body>
</html>
`;
}
