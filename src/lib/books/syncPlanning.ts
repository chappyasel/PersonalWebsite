import { shouldRepairCover } from "./coverValidation";
import { type AudibleLengthResult, audibleUrlFromAsin } from "./lengthFetcher";
import { BOOKS_PRODUCTION_ORIGIN } from "./origin";
import { getBookPath } from "./paths";
import type { BaseBook } from "./types";

type SyncBookMetadata = Pick<
  BaseBook,
  "audioLengthMin" | "audibleUrl" | "coverUrl"
>;

/**
 * Lookup is needed when either half of the Audible metadata pair is missing.
 */
export function shouldLookupAudibleMetadata(
  audioLengthMin: number | null,
  audibleUrl: string | null,
): boolean {
  return audioLengthMin == null || audibleUrl == null;
}

/**
 * Apply an Audible match while preserving a runtime entered manually in
 * Notion. The match always supplies the missing canonical Audible URL.
 */
export function mergeAudibleMetadata(
  audioLengthMin: number | null,
  audible: AudibleLengthResult,
): {
  audioLengthMin: number;
  audibleUrl: string;
  fetchedAudioLengthMin: number | undefined;
} {
  return {
    audioLengthMin: audioLengthMin ?? audible.runtimeMin,
    audibleUrl: audibleUrlFromAsin(audible.asin),
    fetchedAudioLengthMin:
      audioLengthMin == null ? audible.runtimeMin : undefined,
  };
}

/**
 * Decide whether a known book must re-enter the full-content/upsert path.
 * A manual runtime without its Audible URL is incomplete and repairable.
 * Books missing both values are not retried daily after a catalog miss.
 */
export function shouldFetchBookContent(
  notionEditedAt: Date,
  dbEditedAt: Date,
  book: SyncBookMetadata,
): boolean {
  const hasIncompleteAudibleMetadata =
    book.audioLengthMin != null && book.audibleUrl == null;

  return (
    notionEditedAt > dbEditedAt ||
    shouldRepairCover(book.coverUrl) ||
    hasIncompleteAudibleMetadata
  );
}

/**
 * The public page for a book, as written to Notion's `Website` property.
 * Always the production host: the sync may run from a dev machine, but the
 * link in Notion has to work from anywhere.
 */
export function bookWebsiteUrl(bookId: string): string {
  return `${BOOKS_PRODUCTION_ORIGIN}${getBookPath(bookId)}`;
}

/**
 * The URL the sync must write into Notion's `Website` property, or null when
 * the property already holds it. Empty, hand-edited, and stale-slug values
 * all come back as a write, so the property converges on the current page
 * URL no matter how it drifted.
 */
export function websiteUrlToWrite(book: {
  id: string;
  websiteUrl: string | null;
}): string | null {
  const url = bookWebsiteUrl(book.id);
  return book.websiteUrl === url ? null : url;
}
