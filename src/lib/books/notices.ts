import { type BaseBook, isCurrentlyReading, readingStatus } from "./types";

export type BookNoticeKind = "reading" | "abandoned" | "automated" | null;

type NoticeInput = Pick<
  BaseBook,
  "started" | "finished" | "abandoned" | "isAutomated" | "hasSummary"
>;

/**
 * Which banner (if any) belongs at the top of a book's notes.
 *
 * Things this encodes that are easy to get wrong:
 *
 * - "Automated?" in Notion only records that a book is in the AI pipeline. It
 *   can be ticked before any summary has been written, so it is not on its own
 *   enough to claim there is an auto-generated summary on the page —
 *   `hasSummary` has to be true too.
 * - A book that is still being read outranks both. The summary does not get
 *   written until it is finished, so whatever is on the page is partial and
 *   the reading notice is the accurate thing to say.
 * - An abandoned book outranks the automated notice the same way: the notes
 *   stop at the drop point and no summary is coming, which is what the
 *   abandoned notice says.
 */
export function selectBookNotice(book: NoticeInput): BookNoticeKind {
  if (isCurrentlyReading(book)) return "reading";
  if (readingStatus(book) === "abandoned") return "abandoned";
  if (book.isAutomated && book.hasSummary) return "automated";
  return null;
}
