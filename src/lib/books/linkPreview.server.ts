import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import sharp from "sharp";
import { unified } from "unified";

import { type MarkdownNode, textOfNode } from "./headingAnchors";
import {
  type IconTone,
  type LinkPreview,
  type LinkPreviews,
  isExternalLink,
  isMentionLink,
} from "./linkPreview";
import { renderableNotes } from "./markdown";
import { env } from "~/env";

const USER_AGENT =
  "Mozilla/5.0 (compatible; chappyasel.com link preview; +https://chappyasel.com)";
/**
 * Every request one preview makes shares this budget, so a site that hangs,
 * redirects in circles or lists a dozen icons costs at most this long.
 */
const UNFURL_BUDGET_MS = 8_000;
const PAGE_TIMEOUT_MS = 5_000;
const ASSET_TIMEOUT_MS = 3_000;
const MAX_REDIRECTS = 4;
/** The head is near the top; reading stops at `</head>` or this. */
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_ASSET_BYTES = 256 * 1024;
/** Only this much of a page is parsed, and a longer tag is skipped, so the
 * attribute regex never runs on more than a few kilobytes. */
const MAX_HEAD_CHARS = 256 * 1024;
const MAX_TAG_CHARS = 4 * 1024;
const MAX_ICON_CANDIDATES = 3;
/** No icon or avatar decodes to more pixels than this, whatever it claims. */
const MAX_IMAGE_PIXELS = 2048 * 2048;
/** Formats sharp may decode from a third-party icon; `raw` is a bitmap
 * this file has already unpacked from an .ico. */
const ICON_FORMATS = new Set(["png", "jpeg", "webp", "gif", "svg", "raw"]);
const ICON_SIZE = 32;
const AVATAR_SIZE = 64;
/** A page's own words are clipped before they reach the book page. */
const MAX_TITLE_CHARS = 200;
const MAX_SITE_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_URL_CHARS = 2048;
/** Icons rank by how close they are to a touch icon's 180px, which reads
 * crisply at 16px on any screen; a vector or `sizes="any"` counts as 512. */
const PREFERRED_ICON_SIZE = 180;
const VECTOR_ICON_SIZE = 512;

/** The page refetches its previews about as often as it rebuilds itself. */
export const LINK_PREVIEW_REVALIDATE = 60 * 60 * 24;
export const LINK_PREVIEW_TAG = "link-previews";
/** How long a book waits by default for previews it has not seen before.
 * The rest finish after the response, so the next request finds them
 * cached. The ISR page waits longer (BOOK_PAGE_PREVIEW_WAIT_MS). */
const PREVIEW_WAIT_MS = 2_500;
/**
 * The book page's static HTML lasts a day, and a preview it went without
 * stays missing until the next rebuild, so the page waits out a whole
 * preview budget. It renders in the background except the first visit to
 * a new book, and stays well inside the 60 s a build allows a page.
 */
export const BOOK_PAGE_PREVIEW_WAIT_MS = UNFURL_BUDGET_MS + 2_000;
const PREVIEW_CONCURRENCY = 4;
/** A preview that failed for a reason that may pass (a timeout, a 503) is
 * not cached; this instance waits this long before trying it again. */
const RETRY_AFTER_MS = 10 * 60_000;

/** A failure worth retrying later, as opposed to a page with nothing to
 * preview. unstable_cache does not store a rejection. */
class TransientPreviewError extends Error {}

/**
 * Loopback, private, link-local, shared, reserved and multicast ranges:
 * nowhere a public web page should be able to send this server. An
 * IPv6 address written with a leading `::` (loopback, unspecified, mapped
 * IPv4) is refused outright.
 */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number) as [number, number, number];
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return !(
      lower.startsWith("::") ||
      /^f[c-d]/.test(lower) ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith("ff") ||
      lower.startsWith("64:ff9b:") ||
      lower.startsWith("2001:db8:")
    );
  }
  return false;
}

/**
 * Whether the address may be fetched: http(s), and every address its host
 * resolves to is public. A host that does not exist is a plain no; any
 * other lookup failure may pass and is thrown. The connection resolves the
 * host again, so a DNS answer that changes in between is not caught; this
 * only fetches pages the owner linked and the icons they name.
 */
async function isPublicUrl(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicAddress(host);
  try {
    const addresses = await lookup(host, { all: true });
    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => isPublicAddress(address))
    );
  } catch (error) {
    if ((error as { code?: string }).code === "ENOTFOUND") return false;
    throw new TransientPreviewError(`Could not resolve ${host}`, {
      cause: error,
    });
  }
}

/**
 * A GET that follows redirects itself, checking every address on the way,
 * so neither a link nor a page's icon can point the server at a private
 * address. Null for an address it refuses and for a 4xx; a 5xx, a 429 or a
 * network failure throws, since those may pass.
 */
async function fetchPublic(
  href: string,
  accept: string,
  signal: AbortSignal,
): Promise<{ response: Response; url: URL } | null> {
  let url = new URL(href);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isPublicUrl(url))) return null;
    let response: Response;
    try {
      response = await fetch(url.href, {
        headers: { "user-agent": USER_AGENT, accept },
        redirect: "manual",
        signal,
      });
    } catch (error) {
      throw new TransientPreviewError(`Could not fetch ${url.host}`, {
        cause: error,
      });
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      url = new URL(location, url);
      continue;
    }
    if (response.ok) return { response, url };
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 429 || response.status >= 500) {
      throw new TransientPreviewError(
        `${url.host} answered ${response.status}`,
      );
    }
    return null;
  }
  return null;
}

/**
 * The body up to `limit` bytes, or up to the first `stopAt` (matched
 * without case) when given, so a page is not read past its head.
 */
async function readCapped(
  response: Response,
  limit: number,
  stopAt?: string,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  let size = 0;
  let tail = "";
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (stopAt) {
      const text = tail + decoder.decode(value, { stream: true }).toLowerCase();
      if (text.includes(stopAt)) break;
      tail = text.slice(-stopAt.length);
    }
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(Math.min(size, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
    if (offset >= bytes.length) break;
  }
  return bytes;
}

/** The page's text in the charset its headers name, UTF-8 otherwise. */
function decodePage(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  middot: "·",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[\da-f]{1,6}|#\d{1,7}|[a-z]+);/gi,
    (match, entity: string) => {
      const code = /^#x/i.test(entity)
        ? parseInt(entity.slice(2), 16)
        : entity.startsWith("#")
          ? parseInt(entity.slice(1), 10)
          : null;
      if (code === null) return ENTITIES[entity.toLowerCase()] ?? match;
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    },
  );
}

function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, double, single, bare] of tag.matchAll(
    /([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    attrs[name!.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? "");
  }
  return attrs;
}

/** Control characters and the bidi overrides that could reorder the words
 * around a mention. */
const UNPRINTABLE =
  /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** A page's own words as the book page may show them: printable, whitespace
 * collapsed, and cut at `max` characters with an ellipsis. */
function clip(text: string | undefined, max: number): string | null {
  const clean = text?.replace(/\s+/g, " ").replace(UNPRINTABLE, "").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export type PageHead = {
  title: string | null;
  site: string | null;
  description: string | null;
  image: string | null;
  /** Icon addresses, best first. */
  icons: string[];
};

function absolute(href: string | undefined, base: string): string | null {
  if (!href?.trim() || href.length > MAX_URL_CHARS) return null;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** The largest side a `sizes` attribute names, 0 when it names none. */
function iconSize(sizes: string | undefined): number {
  if (sizes?.toLowerCase() === "any") return VECTOR_ICON_SIZE;
  return Math.max(
    0,
    ...[...(sizes ?? "").matchAll(/(\d+)x(\d+)/gi)].map((m) => Number(m[1])),
  );
}

/**
 * What a page says about itself in its head: Open Graph first, then the
 * plain tags. Icons are ranked so the first is the sharpest one that will
 * still read at 16px: a touch icon or a sized PNG or SVG ahead of a bare
 * favicon, and /favicon.ico last as the browser's own fallback.
 *
 * The head is walked tag by tag with indexOf, never with a regex across the
 * whole page, so a page full of unclosed tags costs one pass.
 */
export function parseHead(html: string, pageUrl: string): PageHead {
  const page = html.slice(0, MAX_HEAD_CHARS);
  const lower = page.toLowerCase();
  const end = lower.indexOf("</head");
  const headEnd = end === -1 ? lower.length : end;
  const meta = new Map<string, string>();
  const links: Record<string, string>[] = [];
  let titleTag: string | null = null;

  for (let at = lower.indexOf("<"); at !== -1 && at < headEnd; ) {
    const name = /^[a-z]+/.exec(lower.slice(at + 1, at + 8))?.[0];
    if (name !== "meta" && name !== "link" && name !== "title") {
      at = lower.indexOf("<", at + 1);
      continue;
    }
    const close = lower.indexOf(">", at);
    if (close === -1 || close > headEnd) break;
    if (close - at <= MAX_TAG_CHARS) {
      if (name === "title") {
        const stop = lower.indexOf("</title", close);
        if (stop === -1) break;
        titleTag ??= page.slice(
          close + 1,
          Math.min(stop, close + 1 + MAX_TAG_CHARS),
        );
        at = lower.indexOf("<", stop + 1);
        continue;
      }
      const attrs = attributes(page.slice(at, close + 1));
      if (name === "link") links.push(attrs);
      else {
        const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
        const content = attrs.content?.trim();
        if (key && content && !meta.has(key)) meta.set(key, content);
      }
    }
    at = lower.indexOf("<", close + 1);
  }

  const icons: { href: string; rank: number }[] = [];
  for (const attrs of links) {
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    const href = absolute(attrs.href, pageUrl);
    if (!href) continue;
    const touch = rel.includes("apple-touch-icon");
    if (!touch && !rel.includes("icon")) continue;
    const svg = attrs.type === "image/svg+xml" || /\.svg(?:$|\?)/i.test(href);
    const size = svg
      ? VECTOR_ICON_SIZE
      : touch
        ? PREFERRED_ICON_SIZE
        : iconSize(attrs.sizes);
    // A sized icon at 32px or more renders crisp at 16px on a 2x screen.
    const rank =
      size >= ICON_SIZE
        ? 1000 - Math.abs(size - PREFERRED_ICON_SIZE) / 10
        : size;
    icons.push({ href, rank });
  }
  icons.sort((a, b) => b.rank - a.rank);
  const fallback = absolute("/favicon.ico", pageUrl);
  // The card loads the share image through the site's image optimizer,
  // which only takes https and passes an SVG through to the reader as is.
  const image = absolute(
    meta.get("og:image") ??
      meta.get("og:image:url") ??
      meta.get("twitter:image"),
    pageUrl,
  );

  return {
    title: clip(
      meta.get("og:title") ??
        meta.get("twitter:title") ??
        (titleTag === null ? undefined : decodeEntities(titleTag)),
      MAX_TITLE_CHARS,
    ),
    site: clip(
      meta.get("og:site_name") ?? meta.get("application-name"),
      MAX_SITE_CHARS,
    ),
    description: clip(
      meta.get("og:description") ??
        meta.get("twitter:description") ??
        meta.get("description"),
      MAX_DESCRIPTION_CHARS,
    ),
    image:
      image?.startsWith("https:") && !/\.svg$/i.test(new URL(image).pathname)
        ? image
        : null,
    icons: [...new Set([...icons.map((icon) => icon.href), fallback])].filter(
      (href): href is string => href !== null,
    ),
  };
}

type IcoImage =
  | { kind: "png"; data: Uint8Array }
  | { kind: "rgba"; data: Uint8Array; width: number; height: number };

/** A 32-bit bitmap entry as RGBA rows, top down. The entry stores its rows
 * bottom up in BGRA, at twice its height (the colour rows, then a mask the
 * alpha channel already covers). */
function rgbaFromBitmap(data: Uint8Array): IcoImage | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 40) return null;
  const headerSize = view.getUint32(0, true);
  const width = view.getInt32(4, true);
  const height = Math.abs(view.getInt32(8, true)) / 2;
  if (view.getUint16(14, true) !== 32) return null;
  // An .ico entry is at most 256px a side; anything else is not one.
  if (width < 1 || width > 256 || height < 1 || height > 256) return null;
  const rowBytes = width * 4;
  if (headerSize + rowBytes * height > data.length) return null;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const source = headerSize + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const from = source + x * 4;
      const to = (y * width + x) * 4;
      rgba[to] = data[from + 2]!;
      rgba[to + 1] = data[from + 1]!;
      rgba[to + 2] = data[from]!;
      rgba[to + 3] = data[from + 3]!;
    }
  }
  return { kind: "rgba", data: rgba, width, height };
}

/**
 * The largest image inside an .ico, which sharp cannot read itself. Larger
 * sizes are usually stored as PNG; a classic 16px favicon is a 32-bit
 * bitmap. Older bitmaps with a palette return null.
 */
export function imageFromIco(bytes: Uint8Array): IcoImage | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 6 || view.getUint16(0, true) !== 0) return null;
  if (view.getUint16(2, true) !== 1) return null;
  const count = view.getUint16(4, true);
  const entries: { width: number; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    if (entry + 16 > bytes.length) break;
    const size = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    entries.push({
      width: bytes[entry]! || 256,
      data: bytes.subarray(offset, offset + size),
    });
  }
  entries.sort((a, b) => b.width - a.width);
  for (const { data } of entries) {
    const isPng =
      data.length > 8 &&
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47;
    const image = isPng ? { kind: "png" as const, data } : rgbaFromBitmap(data);
    if (image) return image;
  }
  return null;
}

/**
 * Third-party bytes as a sharp image, refusing anything but the formats an
 * icon or avatar comes in and anything that decodes past MAX_IMAGE_PIXELS.
 */
async function decodeImage(bytes: Uint8Array): Promise<sharp.Sharp> {
  const ico = imageFromIco(bytes);
  const image =
    ico?.kind === "rgba"
      ? sharp(ico.data, {
          raw: { width: ico.width, height: ico.height, channels: 4 },
        })
      : sharp(ico?.data ?? bytes, {
          density: 192,
          limitInputPixels: MAX_IMAGE_PIXELS,
        });
  const { format } = await image.metadata();
  if (!format || !ICON_FORMATS.has(format)) {
    throw new Error(`Not an icon format: ${format ?? "unknown"}`);
  }
  return image;
}

const dataUri = (type: string, bytes: Buffer) =>
  `data:${type};base64,${bytes.toString("base64")}`;

const luminance = (r: number, g: number, b: number) =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** The share of the icon's edge that has to be opaque for it to be a tile. */
const TILE_EDGE = 0.7;
/** Below this a tile or glyph is dark; above the light marks it is light. */
const DARK = { tile: 0.2, glyph: 0.3 };
const LIGHT = { tile: 0.92, glyph: 0.85 };
/** A glyph with more colour than this reads on either ground. */
const GREY_CHROMA = 0.15;

/**
 * How an icon fares on the page's two grounds, from its RGBA pixels. A
 * near-black or near-white glyph on transparency (GitHub's mark, many
 * wordmarks) vanishes on the matching page; a tile of the page's own shade
 * loses its edge. Coloured icons read on both and come back null.
 */
export function iconTone(
  rgba: Uint8Array,
  width: number,
  height: number,
): IconTone {
  const at = (x: number, y: number) => (y * width + x) * 4;
  // The outer ring, short of corners a rounded tile leaves clear.
  let edge = 0;
  let edgeSolid = 0;
  let edgeLight = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const nearCorner =
        Math.min(x, width - 1 - x) < 3 && Math.min(y, height - 1 - y) < 3;
      if (!onEdge || nearCorner) continue;
      const i = at(x, y);
      edge++;
      if (rgba[i + 3]! < 200) continue;
      edgeSolid++;
      edgeLight += luminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    }
  }
  if (edge && edgeSolid / edge > TILE_EDGE) {
    const light = edgeLight / edgeSolid;
    return light < DARK.tile
      ? "dark-tile"
      : light > LIGHT.tile
        ? "light-tile"
        : null;
  }
  let solid = 0;
  let light = 0;
  let chroma = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    solid++;
    light += luminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    chroma +=
      (Math.max(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!) -
        Math.min(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)) /
      255;
  }
  if (!solid || chroma / solid > GREY_CHROMA) return null;
  return light / solid < DARK.glyph
    ? "dark-glyph"
    : light / solid > LIGHT.glyph
      ? "light-glyph"
      : null;
}

type Within = (ms: number) => AbortSignal;

/** The first of up to three icons that downloads and decodes, as a 32px
 * PNG data URI with its tone. A missing or broken icon only costs the icon. */
async function fetchIcon(
  candidates: string[],
  within: Within,
): Promise<{ icon: string; iconTone: IconTone } | null> {
  for (const href of candidates.slice(0, MAX_ICON_CANDIDATES)) {
    try {
      const fetched = await fetchPublic(
        href,
        "image/*",
        within(ASSET_TIMEOUT_MS),
      );
      if (!fetched) continue;
      const image = await decodeImage(
        await readCapped(fetched.response, MAX_ASSET_BYTES),
      );
      const png = await image
        .resize(ICON_SIZE, ICON_SIZE, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      const { data, info } = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        icon: dataUri("image/png", png),
        iconTone: iconTone(data, info.width, info.height),
      };
    } catch {
      // An icon sharp cannot read, or one that timed out: try the next.
    }
  }
  return null;
}

async function fetchAvatar(
  owner: string,
  within: Within,
): Promise<string | null> {
  try {
    const fetched = await fetchPublic(
      `https://github.com/${owner}.png?size=${AVATAR_SIZE * 2}`,
      "image/*",
      within(ASSET_TIMEOUT_MS),
    );
    if (!fetched) return null;
    const image = await decodeImage(
      await readCapped(fetched.response, MAX_ASSET_BYTES),
    );
    const webp = await image
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
    return dataUri("image/webp", webp);
  } catch {
    return null;
  }
}

const GITHUB_PATH =
  /^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:blob|tree)\/[^/]+\/(.+?))?\/?$/;

/**
 * A repository or a file in one, from GitHub's API rather than the page:
 * the page's share image is a card of star and fork counts, which the site
 * does not show. The owner's avatar goes on the hover card.
 *
 * The site's token can read the owner's private repositories, so only a
 * public repository's description and canonical names are used; a private
 * one keeps the names its address already shows. Null when GitHub has no
 * such repository (a page like /features/copilot), so the page itself is
 * previewed instead.
 */
async function githubPreview(
  url: URL,
  within: Within,
): Promise<LinkPreview | null> {
  const match = GITHUB_PATH.exec(url.pathname);
  if (!match) return null;
  const [, owner, repo, path] = match as unknown as [
    string,
    string,
    string,
    string?,
  ];
  let file: string | null = null;
  try {
    file = path ? decodeURIComponent(path.split("/").pop()!) : null;
  } catch {
    file = path?.split("/").pop() ?? null;
  }
  const avatar = fetchAvatar(owner, within);
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": USER_AGENT,
        ...(env.GITHUB_TOKEN
          ? { authorization: `Bearer ${env.GITHUB_TOKEN}` }
          : {}),
      },
      signal: within(PAGE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TransientPreviewError("GitHub did not answer", { cause: error });
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new TransientPreviewError(`GitHub answered ${response.status}`);
  }
  const body = (await response.json()) as {
    name?: string;
    private?: boolean;
    description?: string | null;
    owner?: { login?: string };
  };
  const isPublic = body.private === false;
  const names = isPublic
    ? { owner: body.owner?.login ?? owner, repo: body.name ?? repo }
    : { owner, repo };
  return {
    site: "GitHub",
    title: file ?? `${names.owner}/${names.repo}`,
    description: isPublic
      ? clip(body.description ?? undefined, MAX_DESCRIPTION_CHARS)
      : null,
    icon: null,
    iconTone: null,
    image: null,
    github: { ...names, file, avatar: await avatar },
  };
}

/**
 * Everything a mention of this address shows. Null when there is nothing
 * to preview (a 404, a PDF, a page without a title, an address the server
 * will not fetch); throws a TransientPreviewError when trying again later
 * may work. Every request shares one UNFURL_BUDGET_MS.
 */
export async function unfurl(href: string): Promise<LinkPreview | null> {
  if (href.length > MAX_URL_CHARS) return null;
  const budget = AbortSignal.timeout(UNFURL_BUDGET_MS);
  const within: Within = (ms) =>
    AbortSignal.any([budget, AbortSignal.timeout(ms)]);
  const url = new URL(href);
  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    const preview = await githubPreview(url, within);
    if (preview) return preview;
  }
  const fetched = await fetchPublic(
    href,
    "text/html,application/xhtml+xml",
    within(PAGE_TIMEOUT_MS),
  );
  if (!fetched) return null;
  const contentType = fetched.response.headers.get("content-type") ?? "";
  if (!/html/i.test(contentType)) {
    await fetched.response.body?.cancel().catch(() => undefined);
    return null;
  }
  const html = decodePage(
    await readCapped(fetched.response, MAX_PAGE_BYTES, "</head"),
    contentType,
  );
  const pageUrl = fetched.url.href;
  const head = parseHead(html, pageUrl);
  if (!head.title) return null;
  // A deep link whose title only names the site (a bot check, a consent
  // wall, a login page) says nothing about the page it points at.
  const host = fetched.url.hostname.replace(/^www\./, "");
  const namesOnlySite = [head.site, host, host.split(".")[0]].some(
    (name) => name?.toLowerCase() === head.title!.toLowerCase(),
  );
  if (namesOnlySite && fetched.url.pathname.replace(/\/$/, "") !== "") {
    return null;
  }
  const icon = await fetchIcon(head.icons, within);
  return {
    site: head.site ?? clip(host, MAX_SITE_CHARS)!,
    title: head.title,
    description: head.description,
    icon: icon?.icon ?? null,
    iconTone: icon?.iconTone ?? null,
    image: head.image,
    github: null,
  };
}

/**
 * Previews by address, cached for a day. A thrown failure is not stored,
 * and during a revalidation it leaves the previous preview in place. Bump
 * the key whenever LinkPreview's fields or their meaning change, or a deploy
 * reads day-old entries of the old shape.
 */
const cachedUnfurl = unstable_cache(unfurl, ["link-preview-v1"], {
  revalidate: LINK_PREVIEW_REVALIDATE,
  tags: [LINK_PREVIEW_TAG],
});

const inFlight = new Map<string, Promise<LinkPreview | null>>();
const failedAt = new Map<string, number>();

/** One preview at a time per address on this instance, and an address that
 * just failed is left alone for RETRY_AFTER_MS. Never rejects. */
function previewFor(href: string): Promise<LinkPreview | null> {
  const failed = failedAt.get(href);
  if (failed !== undefined && Date.now() - failed < RETRY_AFTER_MS) {
    return Promise.resolve(null);
  }
  let pending = inFlight.get(href);
  if (!pending) {
    pending = cachedUnfurl(href)
      .catch((error: unknown) => {
        failedAt.set(href, Date.now());
        console.warn(`  ✗ No link preview for ${href}:`, error);
        return null;
      })
      .finally(() => inFlight.delete(href));
    inFlight.set(href, pending);
  }
  return pending;
}

const WEB_ADDRESS = /https?:\/\/[^\s)\]>"']+/g;
const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkRehype);

/**
 * The web links the book page will draw, found the way its renderer finds
 * them: the same Markdown dialect (GFM autolinks, balanced parentheses, no
 * links inside code) and the same normalized `href`, so a preview's key is
 * the address the renderer looks up. Raw HTML is left out; the toggle
 * summaries it carries draw their links plainly.
 */
export function noteLinks(
  notes: string,
): { href: string; label: string; title: string | null }[] {
  // Most notes link nothing outside Notion and their own images: skip the
  // parse for them.
  if (
    ![...notes.matchAll(WEB_ADDRESS)].some(([address]) =>
      isExternalLink(address),
    )
  ) {
    return [];
  }
  const tree = markdown.runSync(
    markdown.parse(renderableNotes(notes)),
  ) as MarkdownNode;
  const links: { href: string; label: string; title: string | null }[] = [];
  const visit = (node: MarkdownNode) => {
    if (node.type === "element" && node.tagName === "a") {
      const { href, title } = node.properties ?? {};
      if (typeof href === "string") {
        links.push({
          href,
          label: textOfNode(node),
          title: typeof title === "string" ? title : null,
        });
      }
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return links;
}

function keepAlive(work: Promise<unknown>) {
  try {
    after(work);
  } catch {
    // Outside a request (a build step, a script) there is nothing to
    // attach it to; it finishes on its own.
    void work;
  }
}

/**
 * Previews for the web links in a book's notes that the page draws as
 * mentions (isMentionLink). A cached preview costs nothing; one not seen
 * before gets PREVIEW_WAIT_MS, and whatever has not finished by then keeps
 * loading after the response, so the next visit has it. Never rejects: a
 * mention without a preview still shows its words or its address.
 */
export async function linkPreviewsFor(
  notes: string,
  waitMs = PREVIEW_WAIT_MS,
): Promise<LinkPreviews> {
  const hrefs = [
    ...new Set(
      noteLinks(notes)
        .filter((link) => isMentionLink(link))
        .map((link) => link.href),
    ),
  ];
  if (!hrefs.length) return {};
  const previews: LinkPreviews = {};
  let next = 0;
  const work = Promise.all(
    Array.from(
      { length: Math.min(PREVIEW_CONCURRENCY, hrefs.length) },
      async () => {
        while (next < hrefs.length) {
          const href = hrefs[next++]!;
          const preview = await previewFor(href);
          if (preview) previews[href] = preview;
        }
      },
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = await Promise.race([
    work.then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), waitMs);
    }),
  ]);
  clearTimeout(timer);
  if (!finished) keepAlive(work);
  return { ...previews };
}
