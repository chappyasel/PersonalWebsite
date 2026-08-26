import { effectiveDaysInYear } from "../stats/yoy";

import { computeHomepageBookStats } from "./homepage";
import type { Book, HomepageBookPlacard, HomepageBookPreview } from "./types";

const BOOKS_SHOWN = 10;
const SUBJECTS_SHOWN = 8;
const MS_PER_DAY = 86_400_000;

function toPreview(book: Book): HomepageBookPreview {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
    started: book.started,
    finished: book.finished,
    rating: book.rating,
    audioLengthMin: book.audioLengthMin,
    pageCount: book.pageCount,
  };
}

/**
 * Reduce the cached library into the small, serializable snapshot the 3D
 * homepage placard needs. Full notes and the rest of each Book record never
 * cross the server/client boundary for this view.
 */
export function buildHomepageBookPlacard(
  allBooks: Book[],
  now = new Date(),
): HomepageBookPlacard {
  // Abandoned books are hidden by default site-wide; the homepage placard
  // (stats, subjects, current shelf) never shows them.
  const books = allBooks.filter((book) => !book.abandoned);
  const finished = books
    .filter((book): book is Book & { finished: string } =>
      Boolean(book.finished),
    )
    .sort((a, b) => b.finished.localeCompare(a.finished));

  const yearCounts = new Map<number, number>();
  for (const book of finished) {
    const year = Number(book.finished.slice(0, 4));
    yearCounts.set(year, (yearCounts.get(year) ?? 0) + 1);
  }

  const currentYear = now.getUTCFullYear();
  const trackedSince =
    yearCounts.size > 0 ? Math.min(...yearCounts.keys()) : null;
  const firstYear = trackedSince ?? currentYear;
  const daysInCurrentYear = Math.round(
    (Date.UTC(currentYear + 1, 0, 1) - Date.UTC(currentYear, 0, 1)) /
      MS_PER_DAY,
  );
  const elapsedFraction =
    effectiveDaysInYear(String(currentYear), now) / daysInCurrentYear;
  const currentYearBooks = yearCounts.get(currentYear) ?? 0;
  const projectedRemainder =
    elapsedFraction > 0 && elapsedFraction < 1
      ? (currentYearBooks * (1 - elapsedFraction)) / elapsedFraction
      : 0;

  const subjectCounts = new Map<string, number>();
  for (const book of books) {
    for (const subject of new Set(book.tags)) {
      subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + 1);
    }
  }

  const current = books
    .filter((book) => book.started && !book.finished)
    .sort((a, b) => (b.started ?? "").localeCompare(a.started ?? ""))
    .slice(0, BOOKS_SHOWN)
    .map(toPreview);
  const recentSlots = Math.max(0, BOOKS_SHOWN - current.length);

  return {
    stats: {
      ...computeHomepageBookStats(books),
      trackedSince,
    },
    subjects: [...subjectCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, SUBJECTS_SHOWN),
    current,
    recent: finished.slice(0, recentSlots).map(toPreview),
    yearly: Array.from(
      { length: Math.max(1, currentYear - firstYear + 1) },
      (_, index) => {
        const year = firstYear + index;
        return {
          year,
          books: yearCounts.get(year) ?? 0,
          projectedRemainder: year === currentYear ? projectedRemainder : 0,
        };
      },
    ),
  };
}
