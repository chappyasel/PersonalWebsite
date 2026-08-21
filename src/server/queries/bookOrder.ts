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
    if (sortOrder === "desc") {
      return [
        asc(sql`CASE WHEN ${books.finished} IS NULL THEN 0 ELSE 1 END`),
        desc(
          sql`CASE WHEN ${books.finished} IS NULL THEN ${books.hasNotes} END`,
        ),
        desc(
          sql`CASE WHEN ${books.finished} IS NULL THEN ${books.started} END`,
        ),
        desc(books.finished),
        asc(books.title),
        asc(books.id),
      ];
    }

    return [
      asc(sql`COALESCE(${books.finished}, NOW())`),
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
