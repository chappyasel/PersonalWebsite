import { shouldRepairCover } from "./coverValidation";
import { type AudibleLengthResult, audibleUrlFromAsin } from "./lengthFetcher";
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
