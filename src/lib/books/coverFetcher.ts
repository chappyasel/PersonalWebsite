import { stripCoverCurl } from "./coverUtils";
/**
 * Book cover fetcher using Amazon print editions, Google Books, and Open
 * Library. Callers only invoke this for new books whose Notion cover is blank.
 */
import { fetchAmazonPrintCover } from "./amazonCoverFetcher";

type GoogleBooksResponse = {
  items?: Array<{
    volumeInfo: {
      imageLinks?: {
        thumbnail?: string;
        small?: string;
        medium?: string;
        large?: string;
        extraLarge?: string;
      };
    };
  }>;
};

type OpenLibraryResponse = {
  docs?: Array<{
    cover_i?: number;
  }>;
};

/**
 * Fetch book cover URL from Google Books API
 */
async function fetchFromGoogleBooks(
  title: string,
  author: string,
): Promise<string | null> {
  try {
    const query = `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as GoogleBooksResponse;

    if (data.items?.[0]?.volumeInfo.imageLinks) {
      const imageLinks = data.items[0].volumeInfo.imageLinks;
      // Prefer higher resolution images
      let coverUrl =
        imageLinks.extraLarge ??
        imageLinks.large ??
        imageLinks.medium ??
        imageLinks.small ??
        imageLinks.thumbnail;

      if (coverUrl) {
        // Upgrade to HTTPS
        coverUrl = coverUrl.replace("http://", "https://");

        // Increase zoom level for better quality (zoom=1 is default, zoom=5 gives much higher res)
        coverUrl = coverUrl.replace(/zoom=\d+/, "zoom=5");

        // Google's thumbnails opt into a rendered page-curl edge; store the
        // flat art so every consumer starts clean.
        coverUrl = stripCoverCurl(coverUrl) ?? coverUrl;

        return coverUrl;
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching from Google Books:", error);
    return null;
  }
}

/**
 * Fetch book cover URL from Open Library API
 */
async function fetchFromOpenLibrary(
  title: string,
  author: string,
): Promise<string | null> {
  try {
    const query = `title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
    const url = `https://openlibrary.org/search.json?${query}&limit=1`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Open Library API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as OpenLibraryResponse;

    if (data.docs?.[0]?.cover_i) {
      const coverId = data.docs[0].cover_i;
      // Try to get the original/largest size first (no size suffix = original)
      // If that fails in practice, the URLs will 404 and we can fall back
      // Available sizes: S (small), M (medium), L (large), or no suffix for original
      return `https://covers.openlibrary.org/b/id/${coverId}.jpg`;
    }

    return null;
  } catch (error) {
    console.error("Error fetching from Open Library:", error);
    return null;
  }
}

/**
 * Fetch book cover URL from multiple sources with fallback
 */
export async function fetchBookCover(
  title: string,
  author: string,
): Promise<string | null> {
  console.log(`Searching for cover: "${title}" by ${author}`);

  // Prefer a validated, high-resolution Amazon print-book cover.
  const amazonCover = await fetchAmazonPrintCover(title, author);
  if (amazonCover) {
    console.log(`✓ Found print cover on Amazon`);
    return amazonCover;
  }

  // Fall back to Google Books.
  const googleCover = await fetchFromGoogleBooks(title, author);
  if (googleCover) {
    console.log(`✓ Found cover on Google Books`);
    return googleCover;
  }

  // Fallback to Open Library
  const openLibraryCover = await fetchFromOpenLibrary(title, author);
  if (openLibraryCover) {
    console.log(`✓ Found cover on Open Library`);
    return openLibraryCover;
  }

  console.log(`✗ No cover found`);
  return null;
}
