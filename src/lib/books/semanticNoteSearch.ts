import { embedMany } from "ai";
import { sql } from "drizzle-orm";

import { db } from "~/server/db";

import { NOTE_EMBEDDING_MODEL } from "./noteEmbeddings";
import { getBookShareUrl } from "./paths";

/** Reciprocal rank fusion's damping constant, the usual 60. */
const RRF_K = 60;
/** A book's score is the sum of its best passages, so depth beats one hit. */
const PASSAGES_PER_BOOK_SCORE = 3;

export type NoteSearchHit = {
  chunkId: number;
  notionId: string;
  query: string;
  /** 0-based position in that query's vector or keyword list. */
  rank: number;
};

export type RankedBook = {
  notionId: string;
  score: number;
  passages: Array<{ chunkId: number; score: number; queries: string[] }>;
};

/**
 * Merge every query's vector and keyword lists into one ranking. A passage
 * scores 1/(60 + rank) for each list it appears in, across all queries; a
 * book scores the sum of its best three passages. Pure, for testing.
 */
export function rankNoteSearchHits(
  hits: NoteSearchHit[],
  options: { maxBooks: number; maxPassagesPerBook: number },
): { books: RankedBook[]; candidateBooks: number } {
  const passages = new Map<
    number,
    { notionId: string; score: number; queries: Set<string> }
  >();
  for (const hit of hits) {
    const passage = passages.get(hit.chunkId) ?? {
      notionId: hit.notionId,
      score: 0,
      queries: new Set<string>(),
    };
    passage.score += 1 / (RRF_K + hit.rank + 1);
    passage.queries.add(hit.query);
    passages.set(hit.chunkId, passage);
  }
  const byBook = new Map<string, RankedBook["passages"]>();
  for (const [chunkId, passage] of passages) {
    const list = byBook.get(passage.notionId) ?? [];
    list.push({
      chunkId,
      score: passage.score,
      queries: [...passage.queries],
    });
    byBook.set(passage.notionId, list);
  }
  const books = [...byBook].map(([notionId, list]) => {
    list.sort((a, b) => b.score - a.score || a.chunkId - b.chunkId);
    return {
      notionId,
      score: list
        .slice(0, PASSAGES_PER_BOOK_SCORE)
        .reduce((sum, passage) => sum + passage.score, 0),
      passages: list.slice(0, options.maxPassagesPerBook),
    };
  });
  books.sort(
    (a, b) => b.score - a.score || a.notionId.localeCompare(b.notionId),
  );
  return {
    books: books.slice(0, options.maxBooks),
    candidateBooks: books.length,
  };
}

export type NoteSearchResult = {
  /** `keyword` when the queries could not be embedded; see `warning`. */
  mode: "hybrid" | "keyword";
  warning?: string;
  queries: string[];
  /** Books with at least one matching passage, before `maxBooks`. */
  candidateBooks: number;
  books: Array<{
    id: string;
    title: string;
    author: string;
    rating: number | null;
    status: "finished" | "reading";
    tags: string[];
    /** The book page on books.chappyasel.com. */
    url: string;
    score: number;
    passages: Array<{
      section: string | null;
      heading: string | null;
      /** The book page at this passage's chapter or takeaway. */
      url: string;
      text: string;
      /** Indexes into the top-level `queries` that found it. */
      queries: number[];
      score: number;
    }>;
  }>;
};

type PassageRow = {
  id: number;
  section: string | null;
  heading: string | null;
  anchor: string | null;
  content: string;
  book_id: string;
  title: string;
  author: string;
  rating: number | null;
  finished: Date | null;
  tags: string[];
};

/** Words joined with OR, so a passage needs one of them, not all. */
function keywordQuery(query: string): string {
  return (query.match(/[\p{L}\p{N}]+/gu) ?? []).join(" or ");
}

/**
 * Search every book's note passages for each query (one per angle of the
 * question) by meaning and by keyword, and return the books ranked with
 * their best passages and chapter links. Abandoned books are left out, as
 * the shelf leaves them out. Read-only.
 */
export async function searchNotesByMeaning(options: {
  queries: string[];
  maxBooks?: number;
  maxPassagesPerBook?: number;
  /** Passages each query takes from each list before merging. */
  candidatesPerList?: number;
}): Promise<NoteSearchResult> {
  const queries = [
    ...new Set(options.queries.map((query) => query.trim()).filter(Boolean)),
  ];
  if (!queries.length) throw new Error("Give at least one search query");
  const maxBooks = options.maxBooks ?? 25;
  const maxPassagesPerBook = options.maxPassagesPerBook ?? 3;
  const limit = options.candidatesPerList ?? 40;

  let embeddings: number[][] | null = null;
  let warning: string | undefined;
  try {
    ({ embeddings } = await embedMany({
      model: NOTE_EMBEDDING_MODEL,
      values: queries,
      providerOptions: { voyage: { inputType: "query" } },
    }));
  } catch (error) {
    warning = `Keyword search only; the queries could not be embedded: ${error instanceof Error ? error.message : String(error)}`;
  }

  const visible = sql`(b.finished IS NOT NULL OR b.abandoned IS NULL)`;
  return db.transaction(async (tx): Promise<NoteSearchResult> => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    const hits: NoteSearchHit[] = [];
    const collect = (query: string, rows: Array<Record<string, unknown>>) =>
      rows.forEach((row, rank) =>
        hits.push({
          chunkId: Number(row.id),
          notionId: String(row.notion_id),
          query,
          rank,
        }),
      );
    for (const [index, query] of queries.entries()) {
      const vector = embeddings?.[index];
      if (vector)
        collect(
          query,
          await tx.execute(sql`
            SELECT c.id, c.notion_id
            FROM book_note_chunks c
            JOIN books b ON b.notion_id = c.notion_id
            WHERE ${visible}
            ORDER BY c.embedding <=> ${`[${vector.join(",")}]`}::vector
            LIMIT ${limit}`),
        );
      const words = keywordQuery(query);
      if (words)
        collect(
          query,
          await tx.execute(sql`
            WITH q AS (SELECT websearch_to_tsquery('english', ${words}) AS query),
            passages AS (
              SELECT c.id, c.notion_id,
                c.search_vector AS doc
              FROM book_note_chunks c
              JOIN books b ON b.notion_id = c.notion_id
              WHERE ${visible}
            )
            SELECT p.id, p.notion_id
            FROM passages p, q
            WHERE p.doc @@ q.query
            ORDER BY ts_rank_cd(p.doc, q.query) DESC, p.id
            LIMIT ${limit}`),
        );
    }

    const ranked = rankNoteSearchHits(hits, { maxBooks, maxPassagesPerBook });
    const chunkIds = ranked.books.flatMap((book) =>
      book.passages.map((passage) => passage.chunkId),
    );
    const details = (chunkIds.length
      ? await tx.execute(sql`
          SELECT c.id, c.section, c.heading, c.anchor, c.content,
            b.id AS book_id, b.title, b.author, b.rating, b.finished,
            coalesce(
              (SELECT array_agg(t.tag_name ORDER BY t.tag_name)
               FROM book_tags t WHERE t.book_id = b.id),
              '{}'
            ) AS tags
          FROM book_note_chunks c
          JOIN books b ON b.notion_id = c.notion_id
          WHERE c.id IN ${sql.raw(`(${chunkIds.map(Number).join(",")})`)}`)
      : []) as unknown as PassageRow[];
    const byChunk = new Map(details.map((row) => [row.id, row]));

    return {
      mode: embeddings ? "hybrid" : "keyword",
      ...(warning ? { warning } : {}),
      queries,
      candidateBooks: ranked.candidateBooks,
      books: ranked.books.flatMap((book): NoteSearchResult["books"] => {
        const first = byChunk.get(book.passages[0]!.chunkId);
        if (!first) return [];
        const url = getBookShareUrl(first.book_id);
        return [
          {
            id: first.book_id,
            title: first.title,
            author: first.author,
            rating: first.rating,
            status: first.finished ? "finished" : "reading",
            tags: first.tags,
            url,
            score: Number(book.score.toFixed(5)),
            passages: book.passages.flatMap((passage) => {
              const row = byChunk.get(passage.chunkId);
              if (!row) return [];
              return [
                {
                  section: row.section,
                  heading: row.heading,
                  url: row.anchor
                    ? `${url}#${encodeURIComponent(row.anchor)}`
                    : url,
                  text: row.content,
                  queries: passage.queries.map((query) =>
                    queries.indexOf(query),
                  ),
                  score: Number(passage.score.toFixed(5)),
                },
              ];
            }),
          },
        ];
      }),
    };
  });
}
