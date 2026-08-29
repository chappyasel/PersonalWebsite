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

// Ranking recomputes its vector per matching row — the GIN index only answers
// the @@ match. Common tokens ("12") match a hundred-plus books, and rebuilding
// the full 500KB note vector for each blew past the provider deadline. Rank
// over the first 50KB of stripped notes instead: cheap per row, and the A/B
// title and author weights still dominate ts_rank_cd ordering.
export const BOOK_SEARCH_RANK_SQL = String.raw`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(author, '')), 'B') || setweight(to_tsvector('english', left(regexp_replace(left(coalesce(notes, ''), 120000), 'data:[^\s)]+', ' ', 'g'), 50000)), 'D')`;

export type BookSearchRow = {
  id: string;
  title: string;
  author: string;
  tags: string[];
  notes: string | null;
  cover_url: string | null;
};

export type BookSearchLoader = (
  query: string,
  signal: AbortSignal,
) => Promise<BookSearchRow[]>;

const bookSearchVector = sql.raw(BOOK_SEARCH_VECTOR_SQL);
const bookSearchRank = sql.raw(BOOK_SEARCH_RANK_SQL);
// Never ship raw notes: the same data: URIs that broke the tsvector cap make
// result rows enormous — "12" matched 24 books carrying 7.2MB of embedded
// images, and moving that from Neon alone blew the provider timeout while the
// query itself took 270ms. Regexp-stripping is bounded to the first 400KB raw
// per row because the regexp itself costs ~40ms/MB/row; past that cut, prose
// in image-heavy books loses excerpt coverage, not search coverage (matching
// still runs on the full indexed vector). The outer 100KB is a defensive cap.
const strippedNotes = sql.raw(
  String.raw`left(regexp_replace(left(coalesce(notes, ''), 400000), 'data:[^\s)]+', ' ', 'g'), 100000)`,
);
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

  // One statement, no transaction: the old SET LOCAL statement_timeout wrapper
  // cost four extra Neon round trips (~500ms at ~90ms RTT) — more than the
  // query itself. The provider deadline in search.ts is the timeout now; the
  // query is GIN-index-bounded at ~200ms server-side even for common tokens.
  //
  // The match arms return only ids and ordering keys: anything heavier in
  // their target lists (the tags subquery, and especially stripped notes)
  // gets computed for every matching row before the sort — a hundred-plus
  // rows for a common token — instead of the 24 survivors joined below.
  const rows = await db.execute<BookSearchRow>(sql`
      WITH identity_matches AS (
        SELECT
          id,
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
          5 AS match_priority,
          ts_rank_cd(
            ${bookSearchRank},
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
        SELECT DISTINCT ON (id) id, match_priority, text_rank
        FROM candidates
        ORDER BY id, match_priority, text_rank DESC
      )
      SELECT
        b.id,
        b.title,
        b.author,
        ARRAY(
          SELECT bt.tag_name
          FROM book_tags bt
          WHERE bt.book_id = b.id
          ORDER BY bt.tag_name
        ) AS tags,
        ${strippedNotes} AS notes,
        b.cover_url
      FROM deduplicated d
      JOIN books b ON b.id = d.id
      ORDER BY d.match_priority, d.text_rank DESC, b.title
      LIMIT 24
    `);

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
    ...(row.cover_url ? { imageUrl: row.cover_url } : {}),
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
