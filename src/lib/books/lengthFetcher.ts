/**
 * Book length fetcher using the Audible catalog API (audio runtime) and
 * Open Library (page count).
 *
 * Self-contained (no ~/env import, plain fetch) so both sync and the
 * backfill script can use it — mirrors coverFetcher.ts.
 */

type AudibleProduct = {
  asin?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  runtime_length_min?: number;
};

type AudibleResponse = {
  products?: AudibleProduct[];
};

type OpenLibraryDoc = {
  title?: string;
  author_name?: string[];
  number_of_pages_median?: number;
};

type OpenLibraryResponse = {
  docs?: OpenLibraryDoc[];
};

type GoogleBooksResponse = {
  items?: Array<{
    volumeInfo: {
      title?: string;
      authors?: string[];
      pageCount?: number;
    };
  }>;
};

export type AudibleLengthResult = {
  runtimeMin: number;
  asin: string;
  matchedTitle: string;
};

export type PageCountResult = {
  pageCount: number;
  matchedTitle: string;
};

export function audibleUrlFromAsin(asin: string): string {
  return `https://www.audible.com/pd/${asin}`;
}

/**
 * Notion stores audio length as H.MM — 12.32 means 12h 32m — so values can
 * be eyeballed against Audible's hours-and-minutes display and hand-edited.
 * The DB stores raw minutes; these convert between the two representations.
 * Note Notion trims trailing zeros (12h 50m displays as "12.5").
 */
export function minutesToHourDotMinutes(totalMinutes: number): number {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return hours + minutes / 100;
}

export function hourDotMinutesToMinutes(value: number): number {
  const hours = Math.trunc(value);
  const minuteDigits = Math.round((value - hours) * 100);
  return hours * 60 + minuteDigits;
}

/**
 * Empirical narration pace measured across this catalog's 258 books that
 * have both values (median 33.2 pages/audio-hour, IQR 27.8–39.3). Used to
 * estimate a page count when no source has one but the runtime is known.
 * Distinct from analytics' PAGES_PER_HOUR, which is wall-clock reading
 * speed for books with no audiobook at all.
 */
export const PAGES_PER_AUDIO_HOUR = 33;

export function estimatePagesFromAudio(runtimeMin: number): number {
  return Math.round((runtimeMin / 60) * PAGES_PER_AUDIO_HOUR);
}

/** Below this, a "page count" is a sample/pamphlet edition, not the book */
const MIN_PLAUSIBLE_PAGES = 20;

/**
 * Normalize for fuzzy comparison: lowercase, strip diacritics and
 * punctuation, collapse whitespace. Titles additionally drop any
 * subtitle after ":".
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(title: string): string {
  // Parenthesized segments are edition/series annotations, not the title
  const bare = title.replace(/\([^)]*\)/g, " ");
  return normalize(bare.split(":")[0] ?? bare)
    .split(" ")
    .filter((word) => word !== "the" && word !== "and")
    .join(" ");
}

/**
 * Verify a search result actually matches the requested book.
 * Requires normalized title equality or prefix/containment, plus author
 * surname overlap. A miss returns false — callers must never store an
 * unverified match.
 */
export function isConfidentMatch(
  candidateTitle: string,
  candidateAuthors: string[],
  title: string,
  author: string,
): boolean {
  const wantedTitle = normalizeTitle(title);
  const foundTitle = normalizeTitle(candidateTitle);
  if (!wantedTitle || !foundTitle) return false;

  // Prefix-only containment: a title that merely CONTAINS the wanted one
  // is usually a different work ("Revenge of the Tipping Point" contains
  // "Tipping Point"). Space-insensitive equality handles spacing variants
  // ("DaVinci"/"Da Vinci").
  const titleMatches =
    foundTitle === wantedTitle ||
    foundTitle.startsWith(wantedTitle) ||
    wantedTitle.startsWith(foundTitle) ||
    foundTitle.replace(/ /g, "") === wantedTitle.replace(/ /g, "");
  if (!titleMatches) return false;

  // Author surname overlap: the last token of any wanted author segment
  // must appear among the candidate's author tokens.
  const wantedSurnames = author
    .split(/,|&|\band\b/i)
    .map((segment) => normalize(segment).split(" ").pop() ?? "")
    .filter((surname) => surname.length > 1);

  // No usable author to verify against — accept on title alone
  if (wantedSurnames.length === 0) return true;

  const candidateTokens = new Set(
    candidateAuthors
      .flatMap((name) => normalize(name).split(" "))
      .filter(Boolean),
  );

  if (candidateTokens.size === 0) {
    // Candidate authors are absent or non-Latin script (e.g. Open Library
    // attributes translated works to the original script: 刘慈欣 for Cixin
    // Liu) — surname verification is impossible. Accept only on exact
    // title equality, not mere prefix overlap.
    return (
      foundTitle === wantedTitle ||
      foundTitle.replace(/ /g, "") === wantedTitle.replace(/ /g, "")
    );
  }

  return wantedSurnames.some((surname) => candidateTokens.has(surname));
}

async function queryAudible(
  title: string,
  author: string,
  includeAuthorInQuery: boolean,
): Promise<AudibleLengthResult | null> {
  try {
    const params = new URLSearchParams({
      title,
      num_results: "5",
      response_groups: "product_attrs,contributors,product_desc",
      products_sort_by: "Relevance",
    });
    if (includeAuthorInQuery) params.set("author", author);
    const url = `https://api.audible.com/1.0/catalog/products?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Audible API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as AudibleResponse;

    for (const product of data.products ?? []) {
      if (!product.runtime_length_min || !product.asin || !product.title) {
        continue;
      }
      const candidateAuthors = (product.authors ?? [])
        .map((a) => a.name ?? "")
        .filter(Boolean);
      if (isConfidentMatch(product.title, candidateAuthors, title, author)) {
        return {
          runtimeMin: product.runtime_length_min,
          asin: product.asin,
          matchedTitle: product.title,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching from Audible:", error);
    return null;
  }
}

/**
 * Fetch audiobook runtime from the Audible catalog API (unofficial, no auth).
 * Returns the first result passing match verification that has a runtime.
 *
 * Audible's author query filter is strict — a misspelled first name returns
 * zero products — so on a miss we retry title-only. isConfidentMatch still
 * requires author surname overlap, so the guard against wrong books holds.
 */
export async function fetchAudibleLength(
  title: string,
  author: string,
): Promise<AudibleLengthResult | null> {
  return (
    (await queryAudible(title, author, true)) ??
    (await queryAudible(title, author, false))
  );
}

async function queryOpenLibraryPages(
  title: string,
  author: string,
  includeAuthorInQuery: boolean,
): Promise<PageCountResult | null> {
  try {
    const params = new URLSearchParams({
      title,
      fields: "title,author_name,number_of_pages_median",
      limit: "5",
    });
    if (includeAuthorInQuery) params.set("author", author);
    const url = `https://openlibrary.org/search.json?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Open Library API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as OpenLibraryResponse;

    for (const doc of data.docs ?? []) {
      if (!doc.title) continue;
      if (
        !doc.number_of_pages_median ||
        doc.number_of_pages_median < MIN_PLAUSIBLE_PAGES
      ) {
        continue;
      }
      if (isConfidentMatch(doc.title, doc.author_name ?? [], title, author)) {
        return {
          pageCount: doc.number_of_pages_median,
          matchedTitle: doc.title,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching page count from Open Library:", error);
    return null;
  }
}

async function queryGoogleBooksPages(
  title: string,
  author: string,
  includeAuthorInQuery: boolean,
): Promise<PageCountResult | null> {
  try {
    const query = includeAuthorInQuery
      ? `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`
      : `intitle:${encodeURIComponent(title)}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5&fields=items(volumeInfo(title,authors,pageCount))`;

    let response = await fetch(url);
    if (response.status === 429) {
      // Google Books throttles unauthenticated bursts; one patient retry
      await new Promise((resolve) => setTimeout(resolve, 3000));
      response = await fetch(url);
    }
    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as GoogleBooksResponse;

    for (const item of data.items ?? []) {
      const info = item.volumeInfo;
      if (!info?.title || !info.pageCount) continue;
      if (info.pageCount < MIN_PLAUSIBLE_PAGES) continue;
      if (isConfidentMatch(info.title, info.authors ?? [], title, author)) {
        return { pageCount: info.pageCount, matchedTitle: info.title };
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching page count from Google Books:", error);
    return null;
  }
}

/**
 * Fetch page count with fallbacks: Open Library (median across editions)
 * first, then Google Books. Each source is tried author-filtered first,
 * then title-only (misspelled authors break server-side filters; match
 * verification still requires author surname overlap either way).
 */
export async function fetchPageCount(
  title: string,
  author: string,
): Promise<PageCountResult | null> {
  return (
    (await queryOpenLibraryPages(title, author, true)) ??
    (await queryOpenLibraryPages(title, author, false)) ??
    (await queryGoogleBooksPages(title, author, true)) ??
    (await queryGoogleBooksPages(title, author, false))
  );
}
