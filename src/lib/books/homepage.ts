import type { Book, HomepageBookStats } from "~/lib/books/types";

export function computeHomepageBookStats(allBooks: Book[]): HomepageBookStats {
  // "N books" means books read or in progress — abandoned ones don't count
  const books = allBooks.filter((book) => !book.abandoned);
  const finishedDates = books
    .map((book) => book.finished)
    .filter((date): date is string => date !== null)
    .sort();

  let perYear: number | null = null;
  let pagesPerDay: number | null = null;
  if (finishedDates.length >= 2) {
    const earliest = new Date(finishedDates[0]!);
    const latest = new Date(finishedDates.at(-1)!);
    const days =
      (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24);
    if (days > 0) {
      perYear = finishedDates.length / (days / 365.25);
      const totalPages = books
        .filter((book) => book.finished)
        .reduce((sum, book) => sum + (book.pageCount ?? 0), 0);
      if (totalPages > 0) pagesPerDay = totalPages / days;
    }
  }

  const durations = books
    .filter((book) => book.started && book.finished)
    .map(
      (book) =>
        (new Date(book.finished!).getTime() -
          new Date(book.started!).getTime()) /
        (1000 * 60 * 60 * 24),
    )
    .filter((days) => days > 0);

  return {
    total: books.length,
    perYear,
    avgDays:
      durations.length > 0
        ? durations.reduce((sum, days) => sum + days, 0) / durations.length
        : null,
    pagesPerDay,
  };
}
