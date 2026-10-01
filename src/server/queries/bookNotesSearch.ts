import { sql } from "drizzle-orm";

import {
  type BookNoteMatch,
  NOTE_MATCH_END,
  NOTE_MATCH_START,
  NOTE_SEARCH_MAX_ROWS,
  noteExcerptSegments,
} from "~/lib/books/notesSearch";
import {
  BOOK_SEARCH_RANK_SQL,
  BOOK_SEARCH_VECTOR_SQL,
} from "~/lib/universal-search/server/books";
import { db } from "~/server/db";

// The same expressions the Command palette searches with, so both answer a
// query from the one GIN index.
const searchVector = sql.raw(BOOK_SEARCH_VECTOR_SQL);
const searchRank = sql.raw(BOOK_SEARCH_RANK_SQL);

const HEADLINE_OPTIONS = `StartSel=${NOTE_MATCH_START}, StopSel=${NOTE_MATCH_END}, MaxWords=34, MinWords=16, MaxFragments=1`;

/**
 * Books whose notes mention the query, best match first, each with the one
 * passage that shows why. The shelf draws these under its title and author
 * matches.
 *
 * Every match comes back: the shelf narrows them by its own filters, so a
 * top-N here would hide matches behind books the visitor filtered out. The
 * notes are a few kilobytes each, and the commonest words take about half a
 * second for rank and headline together.
 */
export async function searchBookNotes(query: string): Promise<BookNoteMatch[]> {
  const rows = await db.execute<{ id: string; headline: string }>(sql`
    WITH q AS (
      SELECT plainto_tsquery('english', ${query}) AS tsq
    ),
    matches AS (
      SELECT id, ts_rank_cd(${searchRank}, q.tsq) AS text_rank
      FROM books, q
      WHERE (finished IS NOT NULL OR started IS NOT NULL)
        AND ${searchVector} @@ q.tsq
      ORDER BY text_rank DESC, title
      LIMIT ${NOTE_SEARCH_MAX_ROWS}
    )
    SELECT
      b.id,
      ts_headline(
        'english',
        coalesce(b.notes, ''),
        q.tsq,
        ${HEADLINE_OPTIONS}
      ) AS headline
    FROM matches m
    JOIN books b ON b.id = m.id
    CROSS JOIN q
    ORDER BY m.text_rank DESC, b.title
  `);

  const matches: BookNoteMatch[] = [];
  for (const row of rows) {
    const excerpt = noteExcerptSegments(row.headline);
    if (excerpt) matches.push({ bookId: row.id, excerpt });
  }
  return matches;
}
