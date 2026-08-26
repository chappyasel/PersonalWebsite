import { asc, desc, sql, type SQL } from "drizzle-orm";

import { books } from "../db/schema";

export type BookSortField =
  | "finished"
  | "title"
  | "rating"
  | "publicationYear"
  | "runtime"
  | "pageCount";

export type BookSortOrder = "asc" | "desc";

export function getBookOrderBy(
  sortField: BookSortField,
  sortOrder: BookSortOrder,
): SQL[] {
  if (sortField === "finished") {
    // A book's place in the timeline is when it left the pile: finished date,
    // or abandoned date for drops. Only truly-in-progress books (neither date)
    // pin to the currently-reading group.
    const endDate = sql`COALESCE(${books.finished}, ${books.abandoned})`;

    if (sortOrder === "desc") {
      return [
        asc(sql`CASE WHEN ${endDate} IS NULL THEN 0 ELSE 1 END`),
        desc(sql`CASE WHEN ${endDate} IS NULL THEN ${books.hasNotes} END`),
        desc(sql`CASE WHEN ${endDate} IS NULL THEN ${books.started} END`),
        desc(endDate),
        asc(books.title),
        asc(books.id),
      ];
    }

    return [
      asc(sql`COALESCE(${books.finished}, ${books.abandoned}, NOW())`),
      asc(books.title),
      asc(books.id),
    ];
  }

  if (sortField === "publicationYear") {
    const nullValue = sortOrder === "desc" ? -999999 : 999999;
    return [
      sortOrder === "desc"
        ? desc(sql`COALESCE(${books.publicationYear}, ${nullValue})`)
        : asc(sql`COALESCE(${books.publicationYear}, ${nullValue})`),
      asc(books.title),
      asc(books.id),
    ];
  }

  if (sortField === "runtime") {
    const nullValue = sortOrder === "desc" ? -999999 : 999999;
    return [
      sortOrder === "desc"
        ? desc(sql`COALESCE(${books.audioLengthMin}, ${nullValue})`)
        : asc(sql`COALESCE(${books.audioLengthMin}, ${nullValue})`),
      asc(books.title),
      asc(books.id),
    ];
  }

  if (sortField === "pageCount") {
    const nullValue = sortOrder === "desc" ? -999999 : 999999;
    return [
      sortOrder === "desc"
        ? desc(sql`COALESCE(${books.pageCount}, ${nullValue})`)
        : asc(sql`COALESCE(${books.pageCount}, ${nullValue})`),
      asc(books.title),
      asc(books.id),
    ];
  }

  return [
    sortOrder === "desc" ? desc(books[sortField]) : asc(books[sortField]),
    asc(books.title),
    asc(books.id),
  ];
}
