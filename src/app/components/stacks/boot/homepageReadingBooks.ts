import { proxiedBookCover } from "../scene/bookCoverTexture";
import { featuredBookThickness } from "../scene/units/featuredBookGeometry";

import type { getDefaultBooks } from "~/server/queries/books";

type HomepageBooks = Awaited<ReturnType<typeof getDefaultBooks>>;

/** Prefer current reads by start date, then backfill from recent covered books. */
export function selectHomepageReadingBooks(allBooks: HomepageBooks) {
  const currentReads = allBooks
    .filter((book) => book.started && !book.finished && book.coverUrl)
    .sort((a, b) => (b.started ?? "").localeCompare(a.started ?? ""))
    .slice(0, 3);
  const currentReadIds = new Set(currentReads.map((book) => book.id));
  return [
    ...currentReads,
    ...allBooks.filter((book) => book.coverUrl && !currentReadIds.has(book.id)),
  ].slice(0, 3);
}

export function toBootReadingBooks(
  readingBooks: ReturnType<typeof selectHomepageReadingBooks>,
) {
  return readingBooks.map(({ id, coverUrl, pageCount, audioLengthMin }) => ({
    id,
    coverSrc: coverUrl ? proxiedBookCover(coverUrl, 256) : null,
    thickness: 1.1 * featuredBookThickness(pageCount, audioLengthMin),
  }));
}
