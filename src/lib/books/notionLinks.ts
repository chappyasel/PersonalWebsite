import { BOOKS_PRODUCTION_ORIGIN } from "./origin";

/**
 * A Notion page URL as it appears in exported notes: `app.notion.com/p/<id>`
 * for a page mention, `www.notion.so/Title-<id>` or a `*.notion.site` link
 * for a pasted address. It ends where a Markdown link target or an HTML
 * attribute does.
 */
const NOTION_URL =
  /https?:\/\/(?:[\w-]+\.)?notion\.(?:so|site|com)\/[^\s)"'<>\]]*/gi;

/** The page ID at the end of a URL path, dashed or not. */
const TRAILING_PAGE_ID =
  /([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/**
 * The page a Notion URL points at, in the dashed form `books.notion_id`
 * stores, or null for a URL that names no page. Only the path counts: a
 * database view's `?v=<id>` is not the page.
 */
export function notionPageIdFromUrl(url: string): string | null {
  const path = url.split(/[?#]/, 1)[0] ?? "";
  const id = TRAILING_PAGE_ID.exec(path)?.[1];
  if (!id) return null;
  const hex = id.replace(/-/g, "").toLowerCase();
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/** Every Notion page a book's notes link to. */
export function notionPageIdsIn(markdown: string): string[] {
  const ids = new Set<string>();
  for (const [url] of markdown.matchAll(NOTION_URL)) {
    const id = notionPageIdFromUrl(url);
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Point each link to another Book Notes page at that book on the site, so
 * the notes renderer draws it as a BookLink. Links to pages the library
 * does not mirror stay on Notion.
 */
export function rewriteNotionBookLinks(
  markdown: string,
  slugByNotionId: ReadonlyMap<string, string>,
): string {
  if (slugByNotionId.size === 0) return markdown;
  return markdown.replace(NOTION_URL, (url) => {
    const id = notionPageIdFromUrl(url);
    const slug = id ? slugByNotionId.get(id) : undefined;
    return slug ? `${BOOKS_PRODUCTION_ORIGIN}/${slug}` : url;
  });
}
