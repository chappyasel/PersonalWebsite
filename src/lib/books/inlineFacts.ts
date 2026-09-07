import { abandonedPercent } from "~/lib/books/types";

import type { BookLookupEntry } from "~/components/notion/types";

import {
  formatLength,
  formatReadDates,
  formatSingleReadDate,
} from "~/app/books/lib/format";

/** The slug in a bare books.chappyasel.com URL, or null for any other text. */
export function bookSlugFromUrl(text: string): string | null {
  const match = /^https?:\/\/books\.chappyasel\.com\/([a-z0-9-]+)\/?$/.exec(
    text.trim(),
  );
  return match?.[1] ?? null;
}

const SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "for",
  "in",
  "on",
  "to",
  "with",
  "is",
]);

/** "the-culture-code" → "The Culture Code". The fallback title when the
 * library has no row for a slug. */
export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((word, i) =>
      i > 0 && SMALL_WORDS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export type InlineBookFacts = {
  /** "Read Mar 12th - Apr 3rd '25", "Abandoned at 40%", "Reading since …" */
  reading: string | null;
  /** Which of those the reading line is, so a card can pick its glyph. */
  kind: "finished" | "abandoned" | "reading" | null;
  /** "8h 12m · ~304 pages" */
  length: string | null;
};

/**
 * The two fact lines under a book's title in its hover card. Finished wins
 * over abandoned and abandoned over reading, the same precedence as
 * readingStatus in src/lib/books/types.ts.
 */
export function inlineBookFacts(book: BookLookupEntry): InlineBookFacts {
  let reading: string | null = null;
  let kind: InlineBookFacts["kind"] = null;
  if (book.finished) {
    const span = formatReadDates(book.started, book.finished);
    reading = `Read ${span ?? formatSingleReadDate(book.finished)}`;
    kind = "finished";
  } else if (book.abandoned) {
    const percent = abandonedPercent({
      abandonedAtMin: book.abandonedAtMin,
      audioLengthMin: book.audioLengthMin,
    });
    reading =
      percent == null
        ? `Abandoned ${formatSingleReadDate(book.abandoned)}`
        : `Abandoned at ${percent}%`;
    kind = "abandoned";
  } else if (book.started) {
    reading = `Reading since ${formatSingleReadDate(book.started)}`;
    kind = "reading";
  }

  return {
    reading,
    kind,
    length: formatLength(book.audioLengthMin, book.pageCount),
  };
}
