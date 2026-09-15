/**
 * Refuse to touch a page that is not one of the book pages.
 *
 * The worker takes page ids from a job file, and a job file is only as good as
 * whatever produced it. Before any mutation the page is read back and checked
 * against the Book Notes data source, so a wrong or stale id fails instead of
 * putting a book jacket on something else. A trashed page is also refused:
 * writing to it would either error or quietly resurrect content.
 *
 * Both values come from the live API, confirmed on 2026-09-15: every one of
 * the 328 book pages reports
 * parent.type "data_source_id" with this data_source_id.
 */
import type { NotionPage } from "./notionApi";

/**
 * The workspace these book pages live in. Not a secret: it is the first path
 * segment of every icon URL Notion hands back. It is here so that a token
 * swapped in the environment fails closed instead of putting book jackets on
 * pages in some other workspace.
 */
export const BOOK_WORKSPACE_ID = "859fbc85-7644-4498-88d8-e0229d8cea32";

export const BOOK_DATA_SOURCE_ID = "9d03bfe1-3c22-411e-921a-60f86bd790c4";
export const BOOK_DATABASE_ID = "340ec223-7246-4d89-a44e-8005075bb7c4";

export type GuardResult = { ok: true } | { ok: false; reason: string };

export function checkBookPage(
  page: NotionPage,
  dataSourceId: string = BOOK_DATA_SOURCE_ID,
): GuardResult {
  if (page.in_trash === true || page.archived === true) {
    return { ok: false, reason: `page ${page.id} is in the trash` };
  }
  const parent = page.parent as
    | { type?: string; data_source_id?: string; database_id?: string }
    | undefined;
  if (!parent) return { ok: false, reason: `page ${page.id} has no parent` };

  if (parent.type === "data_source_id") {
    return parent.data_source_id === dataSourceId
      ? { ok: true }
      : {
          ok: false,
          reason: `page ${page.id} belongs to data source ${parent.data_source_id ?? "unknown"}, not the book library`,
        };
  }
  // Older responses name the database instead; accept only the book database.
  if (parent.type === "database_id") {
    return parent.database_id === BOOK_DATABASE_ID
      ? { ok: true }
      : {
          ok: false,
          reason: `page ${page.id} belongs to database ${parent.database_id ?? "unknown"}, not the book library`,
        };
  }
  return {
    ok: false,
    reason: `page ${page.id} has parent type ${parent.type ?? "unknown"}, not a book row`,
  };
}
