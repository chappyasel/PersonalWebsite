import { MUSINGS_ORIGIN, type MusingArticle, musingUrl } from "./types";

const xml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
export function musingsFeed(articles: MusingArticle[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Musings by Chappy Asel</title><link>${MUSINGS_ORIGIN}/musings</link><description>Essays by Chappy Asel.</description><language>en-us</language><atom:link href="${MUSINGS_ORIGIN}/musings/feed.xml" rel="self" type="application/rss+xml"/>${articles.map((a) => `<item><title>${xml(a.title)}</title><link>${xml(musingUrl(a.slug))}</link><guid isPermaLink="true">${xml(musingUrl(a.slug))}</guid><pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate><description>${xml(a.description)}</description></item>`).join("")}</channel></rss>`;
}
