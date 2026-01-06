export type Book = {
  id: string;
  title: string;
  author: string;
  publicationYear: number | null;
  started: string | null; // ISO date string
  finished: string | null; // ISO date string
  rating: number | null; // 1-5
  tags: string[]; // From multi_select (34 options)
  hasNotes: boolean;
  hasSummary: boolean;
  coverUrl: string | null;
  notionUrl: string;
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
  field: "finished" | "title";
  order: "asc" | "desc";
};

export type BookStats = {
  totalBooks: number;
  booksPerYear: Record<number, number>; // { 2024: 70, 2023: 65, ... }
  avgRating: number;
  categoryBreakdown: Record<string, number>; // tag counts
  booksWithNotes: number;
};

export type BookCoverCache = {
  id: number;
  title: string;
  author: string;
  coverUrl: string | null;
  source: "notion" | "google-books";
  fetchedAt: Date;
};
