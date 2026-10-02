import { embedMany } from "ai";
import { eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db } from "~/server/db";
import { bookNoteChunks, books } from "~/server/db/schema";

import { type NoteChunk, chunkBookNotes } from "./noteChunks";

/**
 * Through the Vercel AI Gateway, which authenticates with
 * AI_GATEWAY_API_KEY locally and in the deployment. 1024 dimensions.
 */
export const NOTE_EMBEDDING_MODEL = "voyage/voyage-4-large";

/**
 * Bump when chunkBookNotes or embeddingInput change what a book's passages
 * hold. Every book's source hash changes with it, so the next refresh
 * rebuilds them all.
 */
const CHUNKER_VERSION = 2;

/** Stop starting books once this many in a row have failed (a missing key). */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * What the model embeds for a passage. A bullet like "Leaders take the
 * first step" says little alone; its book and chapter say what it is about.
 */
export function embeddingInput(
  book: { title: string; author: string },
  chunk: NoteChunk,
): string {
  const path = [chunk.section, chunk.heading].filter(Boolean).join(" › ");
  return `${book.title} by ${book.author}\n${path ? `${path}\n` : ""}\n${chunk.text}`;
}

export function noteSourceHash(book: {
  title: string;
  author: string;
  notes: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        CHUNKER_VERSION,
        NOTE_EMBEDDING_MODEL,
        book.title,
        book.author,
        book.notes ?? "",
      ]),
    )
    .digest("hex");
}

export type NoteEmbeddingRefresh = {
  /** Books whose passages were rebuilt and embedded. */
  booksEmbedded: number;
  passagesWritten: number;
  /** Stale books left for a later run by `maxBooks`. */
  booksPending: number;
  /** Books whose notes yield no passages (none written, or all skeleton). */
  booksWithoutPassages: number;
  /** Books whose page left the mirror, passages deleted. */
  booksRemoved: number;
  failures: Array<{ notionId: string; title: string; error: string }>;
};

/**
 * Bring every book's note-search passages in line with its notes: rebuild
 * and embed the books whose source hash changed, drop passages for pages
 * that left the mirror. A failed book keeps its previous passages and stays
 * stale, so the next run retries it. Never throws for one book's failure.
 */
export async function refreshNoteEmbeddings(
  options: {
    /** Limit the run to these Notion pages, as a scoped sync does. */
    onlyNotionIds?: ReadonlySet<string>;
    /** Most books to embed this run; the rest count as pending. */
    maxBooks?: number;
    concurrency?: number;
  } = {},
): Promise<NoteEmbeddingRefresh> {
  const result: NoteEmbeddingRefresh = {
    booksEmbedded: 0,
    passagesWritten: 0,
    booksPending: 0,
    booksWithoutPassages: 0,
    booksRemoved: 0,
    failures: [],
  };
  const rows = await db
    .select({
      notionId: books.notionId,
      title: books.title,
      author: books.author,
      notes: books.notes,
    })
    .from(books);
  const stored = new Map<string, Set<string>>();
  for (const row of await db
    .selectDistinct({
      notionId: bookNoteChunks.notionId,
      sourceHash: bookNoteChunks.sourceHash,
    })
    .from(bookNoteChunks)) {
    const hashes = stored.get(row.notionId) ?? new Set<string>();
    hashes.add(row.sourceHash);
    stored.set(row.notionId, hashes);
  }

  if (!options.onlyNotionIds) {
    const live = new Set(rows.map((row) => row.notionId));
    const orphans = [...stored.keys()].filter((id) => !live.has(id));
    if (orphans.length) {
      await db
        .delete(bookNoteChunks)
        .where(inArray(bookNoteChunks.notionId, orphans));
      result.booksRemoved = orphans.length;
    }
  }

  const stale = rows.flatMap((row) => {
    if (options.onlyNotionIds && !options.onlyNotionIds.has(row.notionId))
      return [];
    const hash = noteSourceHash(row);
    const hashes = stored.get(row.notionId);
    return hashes?.size === 1 && hashes.has(hash) ? [] : [{ ...row, hash }];
  });

  // Chunking is cheap; only books with passages take an embedding slot.
  const toEmbed: Array<(typeof stale)[number] & { chunks: NoteChunk[] }> = [];
  for (const book of stale) {
    const chunks = chunkBookNotes(book.notes ?? "");
    if (chunks.length) {
      toEmbed.push({ ...book, chunks });
      continue;
    }
    result.booksWithoutPassages++;
    if (stored.has(book.notionId))
      await db
        .delete(bookNoteChunks)
        .where(eq(bookNoteChunks.notionId, book.notionId));
  }
  const batch = toEmbed.slice(0, options.maxBooks ?? toEmbed.length);
  result.booksPending = toEmbed.length - batch.length;
  if (batch.length)
    console.log(
      `Embedding note passages for ${batch.length} book(s)${result.booksPending ? ` (${result.booksPending} left for later runs)` : ""}...`,
    );

  let next = 0;
  let consecutiveFailures = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(options.concurrency ?? 2, batch.length) },
      async () => {
        while (
          next < batch.length &&
          consecutiveFailures < MAX_CONSECUTIVE_FAILURES
        ) {
          const book = batch[next++]!;
          try {
            const { embeddings } = await embedMany({
              model: NOTE_EMBEDDING_MODEL,
              values: book.chunks.map((chunk) => embeddingInput(book, chunk)),
              providerOptions: { voyage: { inputType: "document" } },
            });
            await db.transaction(async (tx) => {
              await tx
                .delete(bookNoteChunks)
                .where(eq(bookNoteChunks.notionId, book.notionId));
              await tx.insert(bookNoteChunks).values(
                book.chunks.map((chunk, ordinal) => ({
                  notionId: book.notionId,
                  ordinal,
                  section: chunk.section,
                  heading: chunk.heading,
                  anchor: chunk.anchor,
                  content: chunk.text,
                  embedding: embeddings[ordinal]!,
                  sourceHash: book.hash,
                })),
              );
            });
            consecutiveFailures = 0;
            result.booksEmbedded++;
            result.passagesWritten += book.chunks.length;
          } catch (error) {
            consecutiveFailures++;
            const message =
              error instanceof Error ? error.message : "Unknown error";
            console.error(
              `  ✗ Could not embed note passages for "${book.title}": ${message}`,
            );
            result.failures.push({
              notionId: book.notionId,
              title: book.title,
              error: message,
            });
          }
        }
      },
    ),
  );
  // Books never started because the run gave up still need a later run.
  result.booksPending += batch.length - next;
  return result;
}
