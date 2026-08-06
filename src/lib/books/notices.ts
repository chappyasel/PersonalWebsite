import { type BaseBook, isCurrentlyReading } from "./types";

export type BookNoticeKind = "reading" | "automated" | null;

type NoticeInput = Pick<
  BaseBook,
  "started" | "finished" | "isAutomated" | "hasSummary"
>;

/**
 * Which banner (if any) belongs at the top of a book's notes.
 *
 * Two things this encodes that are easy to get wrong:
 *
 * - "Automated?" in Notion only records that a book is in the AI pipeline. It
 *   can be ticked before any summary has been written, so it is not on its own
 *   enough to claim there is an auto-generated summary on the page —
 *   `hasSummary` has to be true too.
 * - A book that is still being read outranks both. The summary does not get
 *   written until it is finished, so whatever is on the page is partial and
 *   the reading notice is the accurate thing to say.
 */
export function selectBookNotice(book: NoticeInput): BookNoticeKind {
  if (isCurrentlyReading(book)) return "reading";
  if (book.isAutomated && book.hasSummary) return "automated";
  return null;
}
