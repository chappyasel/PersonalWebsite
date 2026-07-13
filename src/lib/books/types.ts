export type BookReading = {
  started: string | null;
  finished: string | null;
  rating: number | null;
};

/** Raw book data from Notion/DB (before re-read computation) */
export type BaseBook = {
  id: string; // Human-readable slug
  notionId: string; // Original Notion page ID
  title: string;
  author: string;
  publicationYear: number | null;
  started: string | null; // ISO date string
  finished: string | null; // ISO date string
  rating: number | null; // 1-5
  audioLengthMin: number | null; // Raw Audible runtime in minutes
  pageCount: number | null;
  tags: string[]; // From multi_select (34 options)
  hasNotes: boolean;
  hasSummary: boolean;
  coverUrl: string | null;
  audibleUrl: string | null;
  notionUrl: string;
};

/** Book with computed re-read data (returned from API) */
export type Book = BaseBook & {
  readNumber: number; // Which read this is (1 = first, 2 = re-read, etc.)
  totalReads: number; // Total times this book has been read
  otherReadings: BookReading[]; // All readings of this book (for detail page)
};

export type BookWithNotes = Book & {
  notes: string; // Notion Markdown content
};

export type BookFilters = {
  tags: string[];
  minRating: number | null; // 4+ means 4
  hasNotes: boolean | null; // true = notes only, null = all
  searchQuery: string;
};

export type BookSort = {
  field:
    | "finished"
    | "title"
    | "rating"
    | "publicationYear"
    | "runtime"
    | "pageCount";
  order: "asc" | "desc";
};

export type BookStats = {
  categoryBreakdown: Record<string, number>; // tag counts
};

export type ReadingAnalyticsBucket = {
  period: string; // ISO week start "YYYY-MM-DD" (Monday), month "YYYY-MM", or year "YYYY"
  wallClockHours: number;
  contentHours: number;
  pages: number; // Estimated pages (~10% margin), spread across reading span
  books: number; // Count of books finished in this bucket
};

export type ReadingAnalytics = {
  weekly: ReadingAnalyticsBucket[];
  monthly: ReadingAnalyticsBucket[];
  yearly: ReadingAnalyticsBucket[];
  totals: {
    books: number;
    wallClockHours: number;
    contentHours: number;
    pages: number;
  };
  excludedCount: number; // Finished books with neither audio length nor page count
};

export type DailyReadingDay = {
  date: string; // "YYYY-MM-DD" (UTC day)
  wallClockHours: number;
  finishes: number; // Books finished on this day
};

export type BookCoverCache = {
  id: number;
  title: string;
  author: string;
  coverUrl: string | null;
  source: "notion" | "google-books";
  fetchedAt: Date;
};

/**
 * Check if a book is currently being read (has started but not finished)
 */
export function isCurrentlyReading(
  book: Pick<Book, "started" | "finished">,
): boolean {
  return book.started !== null && book.finished === null;
}
