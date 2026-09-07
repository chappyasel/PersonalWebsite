/**
 * The stored form of a Google Books cover: the URL as pasted or fetched,
 * minus the `edge=curl` parameter that renders a fake page curl into the
 * image. The sync and both fetchers pass every cover through this so the
 * column starts flat; enhanceCoverUrl below still guards render time.
 */
export function stripCoverCurl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "books.google.com" || !parsed.searchParams.has("edge")) {
      return url;
    }
    parsed.searchParams.delete("edge");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Enhance book cover URLs for higher quality images
 */
export function enhanceCoverUrl(url: string | null): string | null {
  if (!url) return null;

  // Google Books' API thumbnails can opt into a rendered page-curl edge.
  // Request the clean, high-resolution cover art everywhere instead.
  try {
    const enhancedUrl = new URL(url);
    if (enhancedUrl.hostname !== "books.google.com") return url;
    enhancedUrl.searchParams.set("zoom", "1");
    enhancedUrl.searchParams.set("fife", "w800");
    enhancedUrl.searchParams.delete("edge");
    return enhancedUrl.toString();
  } catch {
    // Cover data comes from an external CMS. A malformed URL should degrade
    // to the existing image fallback, never throw during homepage rendering.
    return url;
  }
}
