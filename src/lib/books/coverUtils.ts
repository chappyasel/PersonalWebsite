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
