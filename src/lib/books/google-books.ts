import { env } from "~/env";

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";

interface GoogleBooksImageLinks {
  extraLarge?: string;
  large?: string;
  medium?: string;
  small?: string;
  thumbnail?: string;
}

interface GoogleBooksResponse {
  items?: Array<{
    volumeInfo?: {
      imageLinks?: GoogleBooksImageLinks;
    };
  }>;
}

/**
 * Fetch book cover image URL from Google Books API
 * @param title - Book title
 * @param author - Book author
 * @returns Cover image URL or null if not found
 */
export async function fetchBookCover(
  title: string,
  author: string,
): Promise<string | null> {
  try {
    // Construct search query
    const query = `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`;
    const apiKey = env.GOOGLE_BOOKS_API_KEY ?? "";
    const url = apiKey
      ? `${GOOGLE_BOOKS_API}?q=${query}&maxResults=1&key=${apiKey}`
      : `${GOOGLE_BOOKS_API}?q=${query}&maxResults=1`;

    const res = await fetch(url);

    if (!res.ok) {
      console.error("Google Books API error:", res.statusText);
      return null;
    }

    const data = (await res.json()) as GoogleBooksResponse;

    // Check if we got results
    if (!data.items?.[0]?.volumeInfo?.imageLinks) {
      return null;
    }

    // Prefer larger image sizes
    const links = data.items[0].volumeInfo.imageLinks;
    const coverUrl =
      links.extraLarge ??
      links.large ??
      links.medium ??
      links.small ??
      links.thumbnail ??
      null;

    if (!coverUrl) return null;

    // Upgrade to HTTPS if needed, and drop Google's rendered page-curl edge
    // so the stored art is flat.
    return coverUrl
      .replace(/^http:/, "https:")
      .replace(/&edge=curl\b/, "");
  } catch (error) {
    console.error("Error fetching book cover from Google Books:", error);
    return null;
  }
}

/**
 * Fetch multiple book covers in batch
 * @param books - Array of {title, author} objects
 * @returns Map of "title|author" to cover URL
 */
export async function fetchBookCovers(
  books: Array<{ title: string; author: string }>,
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  // Fetch covers with a small delay to avoid rate limiting
  for (const book of books) {
    const key = `${book.title}|${book.author}`;
    const cover = await fetchBookCover(book.title, book.author);
    results.set(key, cover);

    // Small delay to avoid hitting rate limits (500ms between requests)
    if (books.indexOf(book) < books.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}
