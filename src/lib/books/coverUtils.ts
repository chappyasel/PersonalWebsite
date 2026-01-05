/**
 * Enhance book cover URLs for higher quality images
 */
export function enhanceCoverUrl(url: string | null): string | null {
  if (!url) return null;

  // For Google Books URLs, add high-quality parameters
  if (url.includes("books.google.com")) {
    let enhancedUrl = url;

    // Increase zoom level for better resolution
    if (enhancedUrl.includes("zoom=")) {
      enhancedUrl = enhancedUrl.replace(/zoom=\d+/, "zoom=1");
    } else {
      enhancedUrl += enhancedUrl.includes("?") ? "&zoom=1" : "?zoom=1";
    }

    // Add fife parameter for even higher quality (w800 = 800px width)
    if (!enhancedUrl.includes("fife=")) {
      enhancedUrl += "&fife=w800";
    }

    return enhancedUrl;
  }

  return url;
}
