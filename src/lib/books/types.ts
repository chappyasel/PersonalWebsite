export type BookReading = {
  started: string | null;
  finished: string | null;
  abandoned: string | null;
  abandonedAtMin: number | null;
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
  /** Abandoned books keep `finished` null; this date alone marks the drop. */
  abandoned: string | null; // ISO date string
  /** Audible position at abandonment, raw minutes (Notion enters H.MM). */
  abandonedAtMin: number | null;
  rating: number | null; // 1-5
  audioLengthMin: number | null; // Raw Audible runtime in minutes
  pageCount: number | null;
  tags: string[]; // From multi_select (34 options)
  hasNotes: boolean;
  hasSummary: boolean;
  isAutomated: boolean;
  /** Notion "Featured?" — hand-picked by Chappy for the homepage shelf.
   * Set per Notion page, so a re-read features only the read he checked. */
  isFeatured: boolean;
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

export type HomepageBookCover = Pick<
  Book,
  "id" | "title" | "author" | "coverUrl"
>;

export type HomepageBookStats = {
  total: number;
  perYear: number | null;
  avgDays: number | null;
  pagesPerDay: number | null;
};

export type HomepageBookPreview = Pick<
  Book,
  | "id"
  | "title"
  | "author"
  | "coverUrl"
  | "started"
  | "finished"
  | "rating"
  | "audioLengthMin"
  | "pageCount"
>;

export type HomepageBookPlacard = {
  stats: HomepageBookStats & { trackedSince: number | null };
  subjects: Array<{ name: string; count: number }>;
  current: HomepageBookPreview[];
  recent: HomepageBookPreview[];
  yearly: Array<{
    year: number;
    books: number;
    projectedRemainder: number;
  }>;
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

export type ReadingStatus = "reading" | "finished" | "abandoned";

/**
 * Derive a book's reading status from its dates. Finished wins over
 * abandoned so a contradictory Notion page (both dates set) degrades to the
 * safer claim; abandoned wins over reading so a drop never renders as
 * still-in-progress.
 */
export function readingStatus(
  book: Pick<Book, "started" | "finished" | "abandoned">,
): ReadingStatus | null {
  if (book.finished !== null) return "finished";
  if (book.abandoned !== null) return "abandoned";
  if (book.started !== null) return "reading";
  return null;
}

/**
 * Check if a book is currently being read (started, neither finished nor
 * abandoned)
 */
export function isCurrentlyReading(
  book: Pick<Book, "started" | "finished" | "abandoned">,
): boolean {
  return readingStatus(book) === "reading";
}

/**
 * How far through an abandoned book the reading got, as a whole percent.
 * Null when either the position or the runtime is missing; clamped to 100
 * when the recorded position overshoots the runtime (stale runtime or typo).
 */
export function abandonedPercent(
  book: Pick<Book, "abandonedAtMin" | "audioLengthMin">,
): number | null {
  if (book.abandonedAtMin == null) return null;
  if (book.audioLengthMin == null || book.audioLengthMin <= 0) return null;
  return Math.min(
    100,
    Math.round((book.abandonedAtMin / book.audioLengthMin) * 100),
  );
}
