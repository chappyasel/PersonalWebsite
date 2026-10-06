/**
 * A pasted web link in the notes, drawn the way Notion draws a link mention:
 * the site's icon, its name, then the page's title.
 *
 * Notion's page-markdown endpoint flattens a link mention to
 * `[page title](url)` and a link preview (GitHub) to `[url](url)`, and drops
 * the icon and the site name. The sync marks each link mention with the
 * title `"@"` (notionMarkdown.ts), and the book page fetches the icon,
 * name and card itself (linkPreview.server.ts). A pasted address is drawn
 * the same way. A link on words the owner typed stays a link in the
 * sentence.
 */
export type LinkPreview = {
  /** The site's own name ("Plurality"), or its host when it gives none. */
  site: string;
  /** The page's title, as the page states it. */
  title: string;
  description: string | null;
  /** The site's icon as a 32px PNG data URI, or null when it has none. */
  icon: string | null;
  /** Whether the icon disappears on one of the page's grounds. */
  iconTone: IconTone;
  /** The page's share image (og:image, https only), loaded through the
   * site's image optimizer only when the card is about to open. */
  image: string | null;
  /** A GitHub repository, or a file in one. */
  github: {
    owner: string;
    repo: string;
    file: string | null;
    /** The owner's avatar as a data URI, for the card. */
    avatar: string | null;
  } | null;
};

/**
 * An icon that vanishes on one of the page's two grounds: a near-black or
 * near-white glyph on transparency (inverted on the ground it matches), or
 * a tile of the ground's own shade (outlined there). Null reads on both.
 */
export type IconTone =
  | "dark-glyph"
  | "light-glyph"
  | "dark-tile"
  | "light-tile"
  | null;

/** Previews for a book's notes, by the link's address as the notes hold it. */
export type LinkPreviews = Record<string, LinkPreview>;

/** Hosts whose links mean something else on the book page: Notion pages,
 * the site itself, and the notes' own images. */
const NOT_A_MENTION =
  /(?:^|\.)(?:notion\.so|notion\.com|notion\.site|chappyasel\.com|blob\.vercel-storage\.com|amazonaws\.com)$/i;

/** An http(s) address the book page may draw as a mention. */
export function isExternalLink(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !NOT_A_MENTION.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function comparable(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The address without its scheme, `www.` or a closing slash. */
export function prettyUrl(href: string): string {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    const path = decodeURIComponent(url.pathname).replace(/\/$/, "");
    return `${host}${path}${url.search}`;
  } catch {
    return href;
  }
}

function decoded(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

/**
 * True when a link's words are only its own address, as Notion writes a
 * pasted URL or a link preview. The page hands the renderer an address
 * with non-ASCII characters percent-encoded, so the decoded form counts too.
 */
export function isPastedAddress(label: string, href: string): boolean {
  const text = comparable(label);
  if (!text || !isExternalLink(href)) return false;
  const host = new URL(href).hostname;
  return [href, decoded(href)]
    .flatMap((address) => [address, address.replace(/\/$/, "")])
    .concat(prettyUrl(href), host, host.replace(/^www\./, ""))
    .some((form) => comparable(form) === text);
}

/**
 * The Markdown link title the sync gives a Notion link mention: `@`, the
 * character Notion mentions with. It has no letters, so the notes' search
 * index never reads it as a word.
 */
export const MENTION_TITLE = "@";

/**
 * The one rule for which links the book page draws as mentions, shared by
 * the server that fetches their previews and the renderer that draws them:
 * a web link Notion holds as a link mention, or one whose words are only
 * its address. Words the owner typed keep the link in the sentence.
 */
export function isMentionLink(link: {
  label: string;
  href: string;
  title?: string | null;
}): boolean {
  if (!isExternalLink(link.href)) return false;
  return link.title === MENTION_TITLE || isPastedAddress(link.label, link.href);
}

const LEADING_SEPARATOR = /^\s*[-–—|·:•]\s*/;
const TRAILING_SEPARATOR = /\s*[-–—|·:•]\s*$/;

/** The title without the site's name, when it names it at either end set
 * off by a separator; "Plurality" inside "Pluralityism" stays. */
function titleWithoutSite(title: string, site: string): string | null {
  const lowerTitle = title.toLowerCase();
  const lowerSite = site.toLowerCase();
  let rest: string | null = null;
  if (lowerTitle.endsWith(lowerSite)) {
    const head = title.slice(0, title.length - site.length);
    if (TRAILING_SEPARATOR.test(head))
      rest = head.replace(TRAILING_SEPARATOR, "");
  } else if (lowerTitle.startsWith(lowerSite)) {
    const tail = title.slice(site.length);
    if (LEADING_SEPARATOR.test(tail))
      rest = tail.replace(LEADING_SEPARATOR, "");
  }
  const trimmed = rest?.trim();
  return trimmed === "" ? null : (trimmed ?? null);
}

/**
 * The site's name as a mention's words give it, for a preview that has none
 * (a site that turned the server away): the part after the last separator
 * or before the first, when it spells the address's own name. "Read —
 * Plurality" on plurality.net gives "Plurality"; words that never name the
 * site give nothing.
 */
function siteInWords(words: string, href: string): string {
  const host = new URL(href).hostname.replace(/^www\./, "");
  const names = new Set([host, host.split(".")[0]!].map(squeezed));
  const parts = words.split(/\s+[-–—|·:•]\s+/);
  if (parts.length < 2) return "";
  return (
    [parts.at(-1)!, parts[0]!].find((part) => names.has(squeezed(part))) ?? ""
  );
}

/** Letters and digits only, lower case: "The World Cafe" is theworldcafe. */
function squeezed(text: string): string {
  return comparable(text).replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * The two runs a mention shows: the muted context (the site's name, or the
 * repository's owner) and the underlined title. A title that already names
 * the site at either end loses that half, so "Read — Plurality" from
 * Plurality shows as "Plurality" then "Read" instead of naming it twice.
 * GitHub reads as its own path, `owner/repo`, so its context is `joined` to
 * the title with no space.
 *
 * `words` are what Notion stored for a link mention, and they are the title,
 * as in Notion; the fetched page's own title is for a pasted address, which
 * has none. Without a preview the words stand alone, or else the address,
 * tidied.
 */
export function mentionText(
  href: string,
  preview?: LinkPreview,
  words?: string,
): { context: string | null; title: string; joined: boolean } {
  if (!preview) {
    return { context: null, title: words ?? prettyUrl(href), joined: false };
  }
  const { github } = preview;
  if (github) {
    return github.file
      ? {
          context: `${github.owner}/${github.repo}/`,
          title: github.file,
          joined: true,
        }
      : { context: `${github.owner}/`, title: github.repo, joined: true };
  }
  const title = (words ?? preview.title).trim();
  const site = preview.site.trim() || (words ? siteInWords(title, href) : "");
  if (!site || comparable(site) === comparable(title)) {
    return { context: null, title, joined: false };
  }
  return {
    context: site,
    title: titleWithoutSite(title, site) ?? title,
    joined: false,
  };
}
