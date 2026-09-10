import { type PageObjectResponse } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";

import { hourDotMinutesToMinutes } from "./lengthFetcher";
import { separateAdjacentQuoteBlocks, toggleHeadings } from "./markdown";
import { createBookNotionClient } from "./notionClient";
import type { BaseBook } from "./types";
import { env } from "~/env";

const notion = createBookNotionClient();

const n2m = new NotionToMarkdown({
  notionClient: notion,
  config: {
    convertImagesToBase64: true, // Convert images to base64 to avoid expiring Notion URLs
  },
});

/**
 * The one Notion property the sync owns end to end. It holds the book's page
 * on books.chappyasel.com so a row in the Book Notes table links straight to
 * the site; the sync rewrites it whenever the slug moves (see
 * `websiteUrlToWrite` in syncPlanning.ts). Never read for content.
 */
export const WEBSITE_PROPERTY = "Website";

/** A book as Notion holds it, before the sync assigns a slug. */
export type NotionBook = BaseBook & {
  lastEditedTime: string;
  /**
   * What the `Website` property holds right now: null until the sync first
   * writes it, stale after a slug change until the next sync.
   */
  websiteUrl: string | null;
};

/**
 * Resolve the Book Notes database to its data source. A database can carry
 * several; the books live in the first.
 */
async function getBooksDataSourceId(): Promise<string> {
  const database = await notion.databases.retrieve({
    database_id: env.NOTION_BOOKS_DATABASE_ID,
  });

  const dataSourceId =
    "data_sources" in database && Array.isArray(database.data_sources)
      ? database.data_sources[0]?.id
      : undefined;
  if (!dataSourceId) {
    throw new Error(
      "Database has no associated data sources. Make sure the database is properly configured.",
    );
  }
  return dataSourceId;
}

/**
 * Add the `Website` URL column to the Book Notes data source when it is
 * missing, so a fresh database (or one where the column was deleted) accepts
 * the sync's writes without a manual step. A column of another type with the
 * same name is left alone and reported, since renaming it is a human call.
 */
export async function ensureWebsiteProperty(): Promise<void> {
  const dataSourceId = await getBooksDataSourceId();
  const dataSource = await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  });

  const existing =
    "properties" in dataSource
      ? dataSource.properties[WEBSITE_PROPERTY]
      : undefined;
  if (existing?.type === "url") return;
  if (existing) {
    console.warn(
      `Notion "${WEBSITE_PROPERTY}" is a ${existing.type} property, not a URL; the sync cannot write book links into it.`,
    );
    return;
  }

  await notion.dataSources.update({
    data_source_id: dataSourceId,
    properties: { [WEBSITE_PROPERTY]: { type: "url", url: {} } },
  });
  console.log(`Added the "${WEBSITE_PROPERTY}" URL property to Book Notes`);
}

/**
 * Fetch all books from the Notion database
 */
export async function fetchBooksFromNotion(): Promise<NotionBook[]> {
  try {
    const dataSourceId = await getBooksDataSourceId();

    // Fetch all books with pagination
    const allBooks: PageObjectResponse[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await notion.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          or: [
            {
              property: "Finished",
              date: { is_not_empty: true },
            },
            {
              property: "Started",
              date: { is_not_empty: true },
            },
          ],
        },
        sorts: [
          {
            property: "Finished",
            direction: "descending",
          },
        ],
        result_type: "page",
        start_cursor: cursor,
        page_size: 100,
      });

      const pages = response.results.filter(
        (result): result is PageObjectResponse =>
          result.object === "page" && "properties" in result,
      );

      allBooks.push(...pages);

      hasMore = response.has_more;
      cursor = response.next_cursor ?? undefined;

      console.log(
        `Fetched ${pages.length} books (total: ${allBooks.length}, hasMore: ${hasMore})`,
      );
    }

    return allBooks.map((page) => ({
      ...transformNotionPageToBook(page),
      lastEditedTime: getLastEditedTime(page),
    }));
  } catch (err) {
    console.error("Error fetching books from Notion:", err);
    throw new Error("Failed to fetch books from Notion", { cause: err });
  }
}

/**
 * Fetch a single book with full notes content
 */
export async function fetchBookDetails(
  bookId: string,
): Promise<Omit<NotionBook, "lastEditedTime"> & { notes: string }> {
  try {
    // Fetch the page
    const page = await notion.pages.retrieve({ page_id: bookId });

    // Ensure we have a full page object with properties
    if (!("properties" in page)) {
      throw new Error("Page does not have properties");
    }

    // Transform to book
    const book = transformNotionPageToBook(page);

    // Fetch all blocks including nested children and convert to markdown
    const mdBlocks = await n2m.pageToMarkdown(bookId);
    const mdString = n2m.toMarkdownString(
      toggleHeadings(separateAdjacentQuoteBlocks(mdBlocks)),
    );
    const notes = mdString.parent ?? "";

    return {
      ...book,
      notes,
    };
  } catch (err) {
    console.error(`Error fetching book details for ${bookId}:`, err);
    // Keep the Notion error as the cause so fetchWithBackoff can still see a
    // 429 through the wrapper; a bare Error looked fatal and was never retried.
    throw new Error("Failed to fetch book details", { cause: err });
  }
}

/**
 * Transform a Notion page to a Book type.
 * Note: The `id` field is initially set to the Notion page ID.
 * It will be replaced with a human-readable slug during sync.
 */
function transformNotionPageToBook(
  page: PageObjectResponse,
): Omit<NotionBook, "lastEditedTime"> {
  const props = page.properties;

  return {
    id: page.id, // Temporary: will be replaced with slug during sync
    notionId: page.id, // Permanent: Notion page ID for reference
    title: extractTitle(props.Title),
    author: extractRichText(props.Author),
    publicationYear:
      props.Publication && "number" in props.Publication
        ? (props.Publication.number ?? null)
        : null,
    started:
      props.Started && "date" in props.Started && props.Started.date
        ? (props.Started.date.start ?? null)
        : null,
    finished:
      props.Finished && "date" in props.Finished && props.Finished.date
        ? (props.Finished.date.start ?? null)
        : null,
    abandoned:
      props.Abandoned && "date" in props.Abandoned && props.Abandoned.date
        ? (props.Abandoned.date.start ?? null)
        : null,
    // Notion's Abandoned At is H.MM like Audio Length (8.21 = 8h 21m)
    abandonedAtMin:
      props["Abandoned At"] &&
      "number" in props["Abandoned At"] &&
      props["Abandoned At"].number != null
        ? abandonedPositionToMinutes(
            props["Abandoned At"].number,
            extractTitle(props.Title),
          )
        : null,
    rating:
      props.Rating && "number" in props.Rating
        ? (props.Rating.number ?? null)
        : null,
    // Notion's Audio Length is H.MM (12.32 = 12h 32m); DB stores raw minutes
    audioLengthMin:
      props["Audio Length"] &&
      "number" in props["Audio Length"] &&
      props["Audio Length"].number != null
        ? hourDotMinutesToMinutes(props["Audio Length"].number)
        : null,
    // Implausibly small page counts (bad source data) are treated as missing
    // so they don't corrupt analytics; enrichment can refill them
    pageCount:
      props.Pages &&
      "number" in props.Pages &&
      props.Pages.number != null &&
      props.Pages.number >= 20
        ? props.Pages.number
        : null,
    tags:
      props.Tags && "multi_select" in props.Tags && props.Tags.multi_select
        ? props.Tags.multi_select.map((tag: { name: string }) => tag.name)
        : [],
    hasNotes:
      props["Notes?"] && "checkbox" in props["Notes?"]
        ? (props["Notes?"].checkbox ?? false)
        : false,
    hasSummary:
      props["Summarized?"] && "checkbox" in props["Summarized?"]
        ? (props["Summarized?"].checkbox ?? false)
        : false,
    // Notion "Automated?" — the summary/key takeaways were drafted by an AI
    // pass over Chappy's handwritten notes and haven't been reviewed yet.
    isAutomated:
      props["Automated?"] && "checkbox" in props["Automated?"]
        ? (props["Automated?"].checkbox ?? false)
        : false,
    // Notion "Featured?" — Chappy's hand-picked shelf. Absent or unset reads
    // as false; no book is featured by accident.
    isFeatured:
      props["Featured?"] && "checkbox" in props["Featured?"]
        ? (props["Featured?"].checkbox ?? false)
        : false,
    coverUrl:
      props.Cover && "url" in props.Cover ? (props.Cover.url ?? null) : null,
    audibleUrl:
      props.Audible && "url" in props.Audible
        ? (props.Audible.url ?? null)
        : null,
    notionUrl: "url" in page ? page.url : "",
    // Sync-owned; read only to decide whether it needs rewriting.
    websiteUrl:
      props[WEBSITE_PROPERTY] && "url" in props[WEBSITE_PROPERTY]
        ? (props[WEBSITE_PROPERTY].url ?? null)
        : null,
  };
}

/**
 * Parse a hand-entered Abandoned At position, warning on values the H.MM
 * convention can't mean: a fractional part above .59 is 60+ minutes, which
 * is almost always the "4.5 means 4h 50m, not 4h 30m" entry mistake.
 */
function abandonedPositionToMinutes(value: number, title: string): number {
  const minuteDigits = Math.round((value - Math.trunc(value)) * 100);
  if (minuteDigits > 59) {
    console.warn(
      `Abandoned At for "${title}" is ${value} — the fractional part reads as ${minuteDigits} minutes. H.MM expects minutes 00-59.`,
    );
  }
  return hourDotMinutesToMinutes(value);
}

/**
 * Get last edited time from a Notion page
 */
export function getLastEditedTime(page: PageObjectResponse): string {
  return page.last_edited_time;
}

/**
 * Extract title text from Notion title property
 */
function extractTitle(
  titleProp: PageObjectResponse["properties"][string] | undefined,
): string {
  if (
    titleProp &&
    "title" in titleProp &&
    Array.isArray(titleProp.title) &&
    titleProp.title[0] &&
    "plain_text" in titleProp.title[0]
  ) {
    return titleProp.title[0].plain_text;
  }
  return "";
}

/**
 * Extract text from Notion rich_text property
 */
function extractRichText(
  richTextProp: PageObjectResponse["properties"][string] | undefined,
): string {
  if (
    richTextProp &&
    "rich_text" in richTextProp &&
    Array.isArray(richTextProp.rich_text) &&
    richTextProp.rich_text[0] &&
    "plain_text" in richTextProp.rich_text[0]
  ) {
    return richTextProp.rich_text[0].plain_text;
  }
  return "";
}
