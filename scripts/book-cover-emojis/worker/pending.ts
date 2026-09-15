/**
 * Whether a page still needs looking at.
 *
 * The rule is per artifact, not per attempt. A page is settled once its record
 * names this work item and this exact artwork, whether the outcome was that we
 * applied the icon or that we found a person owns it and stood down. New
 * artwork reopens the question, once, which is the right amount: a new cover is
 * new information, and one look per revision cannot starve the queue.
 *
 * Comparing revision numbers alone, as this first did, was wrong twice. The
 * numbers restart per work item so they collide across books, and a manual skip
 * wrote no record at all, so those pages came back on every run forever.
 */
import { MAX_PAGE_ATTEMPTS, type AppliedRecord } from "./state";

/**
 * What a settled record has to match. The emoji name belongs here: a
 * name-only revision changes neither the artwork nor the pages, so a record
 * keyed on those alone would keep the page settled under its old name and the
 * correction would never be applied.
 */
export type ArtifactRef = { workId: string; sha256: string; emojiName: string };

export function isSettled(
  record: AppliedRecord | undefined,
  artifact: ArtifactRef,
): boolean {
  if (!record) return false;
  if (
    record.workId !== artifact.workId ||
    record.sha256 !== artifact.sha256 ||
    record.emojiName !== artifact.emojiName
  ) {
    return false;
  }
  // An unfinished intent is never settled: it marks a page whose PATCH may or
  // may not have landed, and only reading the live icon can say which.
  if (record.state === "intent") return false;
  // A failure is settled only once its attempts are spent. Until then the page
  // is retried; after that it stops consuming batch slots and shows up in
  // status instead, so one broken page cannot starve the rest of the catalog.
  if (record.state === "failed") {
    return (record.attempts ?? 0) >= MAX_PAGE_ATTEMPTS;
  }
  return true;
}

/** Pages that gave up, for the status report. */
export function exhaustedPages(
  records: Readonly<Record<string, AppliedRecord>>,
): Array<{ notionId: string; record: AppliedRecord }> {
  return Object.entries(records)
    .filter(([, record]) => record.state === "failed" && (record.attempts ?? 0) >= MAX_PAGE_ATTEMPTS)
    .map(([notionId, record]) => ({ notionId, record }));
}

export function outstandingPages<T extends { notionId: string }>(
  pages: readonly T[],
  records: Readonly<Record<string, AppliedRecord>>,
  artifact: ArtifactRef,
): T[] {
  return pages.filter((page) => !isSettled(records[page.notionId], artifact));
}
