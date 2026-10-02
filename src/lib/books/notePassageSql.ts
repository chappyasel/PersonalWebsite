import { type SQL, sql } from "drizzle-orm";

/**
 * A note-search passage's text as keyword search reads it: its chapter or
 * takeaway heading, then its body. `book_note_chunks.search_vector` is
 * generated from the same two columns (migration 0022), and excerpts are
 * cut from this text, so a word only in a chapter title still finds and
 * shows its passage.
 */
export const PASSAGE_TEXT_SQL = sql.raw(
  `concat_ws(E'\\n', c.heading, c.content)`,
);

/**
 * The passage of one book (`notionId`) that ranks highest for `tsquery`, as
 * a LATERAL subquery yielding `anchor` and `text`; ties go to the earlier
 * passage. The shelf and the Command palette both open a notes match at
 * this passage and take its excerpt from it, so one query opens the same
 * chapter from either. `when` skips the lookup for rows that are not notes
 * matches.
 */
export function bestPassageSql(
  notionId: SQL,
  tsquery: SQL,
  when: SQL = sql`true`,
): SQL {
  return sql`(
    SELECT c.anchor, ${PASSAGE_TEXT_SQL} AS text
    FROM book_note_chunks c
    WHERE ${when}
      AND c.notion_id = ${notionId}
      AND c.search_vector @@ ${tsquery}
    ORDER BY ts_rank_cd(c.search_vector, ${tsquery}) DESC, c.ordinal
    LIMIT 1
  )`;
}
