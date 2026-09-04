import { inArray } from "drizzle-orm";

import type { BookLookup } from "~/components/notion/types";
import { db } from "~/server/db";
import { books } from "~/server/db/schema";
import { orEmpty } from "~/server/queries/degrade";

/** Every books.chappyasel.com/<slug> mentioned anywhere in a synced snapshot. */
export function extractBookSlugs(data: unknown): string[] {
  const slugs = new Set<string>();
  const re = /books\.chappyasel\.com\/([a-z0-9-]+)/g;
  for (const match of JSON.stringify(data).matchAll(re)) {
    if (match[1]) slugs.add(match[1]);
  }
  return [...slugs];
}

/**
 * Title, cover, and hover-card facts for every book a snapshot links.
 *
 * The page itself is static JSON. The database only decorates its book
 * links, so an outage drops the covers and cards and leaves every word on
 * the page readable. `scope` names the caller in the degrade log.
 */
export async function lookupInlineBooks(
  scope: string,
  data: unknown,
): Promise<BookLookup> {
  const slugs = extractBookSlugs(data);
  if (slugs.length === 0) return {};

  const rows = await orEmpty(
    scope,
    () =>
      db
        .select({
          id: books.id,
          title: books.title,
          author: books.author,
          coverUrl: books.coverUrl,
          rating: books.rating,
          started: books.started,
          finished: books.finished,
          abandoned: books.abandoned,
          abandonedAtMin: books.abandonedAtMin,
          audioLengthMin: books.audioLengthMin,
          pageCount: books.pageCount,
          hasNotes: books.hasNotes,
        })
        .from(books)
        .where(inArray(books.id, slugs)),
    [],
  );

  const lookup: BookLookup = {};
  for (const row of rows) {
    lookup[row.id] = {
      title: row.title,
      author: row.author,
      coverUrl: row.coverUrl,
      rating: row.rating,
      started: row.started?.toISOString() ?? null,
      finished: row.finished?.toISOString() ?? null,
      abandoned: row.abandoned?.toISOString() ?? null,
      abandonedAtMin: row.abandonedAtMin,
      audioLengthMin: row.audioLengthMin,
      pageCount: row.pageCount,
      hasNotes: row.hasNotes,
    };
  }
  return lookup;
}
