import { normalizeSearchText, rankSearchCandidates } from "../ranking";
import type { SearchResult } from "../types";
import { resolveDestinationTarget } from "../urls";
import { sql } from "drizzle-orm";

import { createServerExcerpt } from "./excerpt";

// Notes embed base64 data: URIs (synced images), which push some books past
// Postgres's 1MB tsvector cap — the-changing-world-order is 6.4MB raw and
// 11KB of actual prose. Strip the URIs and cap what's left so the index
// builds and the same expression stays evaluable at query time.
// String.raw so the \s survives verbatim: the migration test checks this
// exact text appears in both this file and the migration SQL, and the
// expression must match the deployed index character-for-character.
export const BOOK_SEARCH_VECTOR_SQL = String.raw`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(author, '')), 'B') || setweight(to_tsvector('english', left(regexp_replace(coalesce(notes, ''), 'data:[^\s)]+', ' ', 'g'), 500000)), 'D')`;

export type BookSearchRow = {
  id: string;
  title: string;
  author: string;
  tags: string[];
  notes: string | null;
};

export type BookSearchLoader = (
  query: string,
  signal: AbortSignal,
) => Promise<BookSearchRow[]>;

const bookSearchVector = sql.raw(BOOK_SEARCH_VECTOR_SQL);
const normalizedTitle = sql.raw(
  "trim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', ' ', 'g'))",
);
const normalizedAuthor = sql.raw(
  "trim(regexp_replace(lower(coalesce(author, '')), '[^a-z0-9]+', ' ', 'g'))",
);

export async function loadBookSearchRows(
  query: string,
  signal: AbortSignal,
): Promise<BookSearchRow[]> {
  if (signal.aborted) throw new Error("search_aborted");
  const { db } = await import("~/server/db");

  const rows = await db.transaction(async (transaction) => {
    await transaction.execute(sql`SET LOCAL statement_timeout = '1200ms'`);
    return transaction.execute<BookSearchRow>(sql`
      WITH identity_matches AS (
        SELECT
          id,
          title,
          author,
          notes,
          ARRAY(
            SELECT bt.tag_name
            FROM book_tags bt
            WHERE bt.book_id = books.id
            ORDER BY bt.tag_name
          ) AS tags,
          CASE
            WHEN ${normalizedTitle} = ${query} THEN 0
            WHEN ${normalizedTitle} LIKE ${`${query}%`} THEN 1
            WHEN ${normalizedTitle} LIKE ${`%${query}%`} THEN 2
            WHEN ${normalizedAuthor} LIKE ${`%${query}%`} THEN 3
            ELSE 4
          END AS match_priority,
          0::real AS text_rank
        FROM books
        WHERE (finished IS NOT NULL OR started IS NOT NULL)
          AND (
            ${normalizedTitle} = ${query}
            OR ${normalizedTitle} LIKE ${`${query}%`}
            OR ${normalizedTitle} LIKE ${`%${query}%`}
            OR ${normalizedAuthor} LIKE ${`%${query}%`}
            OR EXISTS (
              SELECT 1
              FROM book_tags bt
              WHERE bt.book_id = books.id
                AND trim(
                  regexp_replace(
                    lower(coalesce(bt.tag_name, '')),
                    '[^a-z0-9]+',
                    ' ',
                    'g'
                  )
                ) LIKE ${`%${query}%`}
            )
          )
        ORDER BY match_priority, title
        LIMIT 24
      ),
      full_text_matches AS (
        SELECT
          id,
          title,
          author,
          notes,
          ARRAY(
            SELECT bt.tag_name
            FROM book_tags bt
            WHERE bt.book_id = books.id
            ORDER BY bt.tag_name
          ) AS tags,
          5 AS match_priority,
          ts_rank_cd(
            ${bookSearchVector},
            plainto_tsquery('english', ${query})
          ) AS text_rank
        FROM books
        WHERE (finished IS NOT NULL OR started IS NOT NULL)
          AND ${bookSearchVector} @@ plainto_tsquery('english', ${query})
        ORDER BY text_rank DESC, title
        LIMIT 24
      ),
      candidates AS (
        SELECT * FROM identity_matches
        UNION ALL
        SELECT * FROM full_text_matches
      ),
      deduplicated AS (
        SELECT DISTINCT ON (id)
          id, title, author, tags, notes, match_priority, text_rank
        FROM candidates
        ORDER BY id, match_priority, text_rank DESC
      )
      SELECT id, title, author, tags, notes
      FROM deduplicated
      ORDER BY match_priority, text_rank DESC, title
      LIMIT 24
    `);
  });

  if (signal.aborted) throw new Error("search_aborted");
  return [...rows];
}

export async function searchBooks(
  query: string,
  options: {
    load?: BookSearchLoader;
    location: URL;
    signal?: AbortSignal;
  },
): Promise<SearchResult[]> {
  const signal = options.signal ?? new AbortController().signal;
  const normalizedQuery = normalizeSearchText(query);
  const rows = await (options.load ?? loadBookSearchRows)(
    normalizedQuery,
    signal,
  );
  const candidates = rows.map((row) => ({
    ...row,
    label: row.title,
    metadata: [row.author, ...row.tags],
    body: row.notes ?? "",
  }));
  const literalMatches = rankSearchCandidates(normalizedQuery, candidates);
  const literalIds = new Set(literalMatches.map((row) => row.id));
  const ranked = [
    ...literalMatches,
    ...candidates
      .filter((row) => !literalIds.has(row.id))
      .map((row) => ({ ...row, matchKind: "body" as const, score: 400 })),
  ];

  return ranked.slice(0, 6).map((row) => ({
    id: `book:${row.id}`,
    kind: "content",
    group: "books",
    label: row.title,
    description: row.author,
    href: resolveDestinationTarget(
      {
        kind: "site",
        site: "books",
        path: `/${encodeURIComponent(row.id)}`,
      },
      options.location,
    ),
    ...(row.matchKind === "body" && row.notes
      ? { excerpt: createServerExcerpt(row.notes, normalizedQuery) }
      : {}),
    matchKind: row.matchKind,
    score: row.score,
  }));
}
