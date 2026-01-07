import { Client, type PageObjectResponse } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";

import type { Book, BookWithNotes } from "./types";
import { env } from "~/env";

const notion = new Client({
  auth: env.NOTION_API_KEY,
});

const n2m = new NotionToMarkdown({
  notionClient: notion,
  config: {
    convertImagesToBase64: true, // Convert images to base64 to avoid expiring Notion URLs
  },
});

/**
 * Fetch all books from the Notion database
 */
export async function fetchBooksFromNotion(): Promise<Book[]> {
  try {
    // First, retrieve the database to get its associated data source ID
    const database = await notion.databases.retrieve({
      database_id: env.NOTION_BOOKS_DATABASE_ID,
    });

    // Get the data source ID from the database's data_sources array
    // A database can have multiple data sources, we'll use the first one
    if (
      "data_sources" in database &&
      Array.isArray(database.data_sources) &&
      database.data_sources.length > 0
    ) {
      const dataSourceId = database.data_sources[0]?.id;
      if (!dataSourceId) {
        throw new Error("Database has no associated data source");
      }

      // Fetch all books with pagination
      const allBooks: PageObjectResponse[] = [];
      let cursor: string | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        const response = await notion.dataSources.query({
          data_source_id: dataSourceId,
          filter: {
            property: "Finished",
            date: {
              is_not_empty: true,
            },
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
    }

    // Fallback: if no data sources found, throw an error
    throw new Error(
      "Database has no associated data sources. Make sure the database is properly configured.",
    );
  } catch (err) {
    console.error("Error fetching books from Notion:", err);
    throw new Error("Failed to fetch books from Notion");
  }
}

/**
 * Fetch a single book with full notes content
 */
export async function fetchBookDetails(bookId: string): Promise<BookWithNotes> {
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
    const mdString = n2m.toMarkdownString(mdBlocks);
    const notes = mdString.parent ?? "";

    return {
      ...book,
      notes,
    };
  } catch (err) {
    console.error(`Error fetching book details for ${bookId}:`, err);
    throw new Error("Failed to fetch book details");
  }
}

/**
 * Transform a Notion page to a Book type.
 * Note: The `id` field is initially set to the Notion page ID.
 * It will be replaced with a human-readable slug during sync.
 */
function transformNotionPageToBook(page: PageObjectResponse): Book {
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
    rating:
      props.Rating && "number" in props.Rating
        ? (props.Rating.number ?? null)
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
    coverUrl:
      props.Cover && "url" in props.Cover ? (props.Cover.url ?? null) : null,
    notionUrl: "url" in page ? page.url : "",
  };
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
