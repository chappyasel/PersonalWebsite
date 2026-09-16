import type { CatalogRow } from "../../../scripts/book-cover-emojis/grouping";
import postgres from "postgres";

export type CloudCatalogRow = CatalogRow & { lastEditedTime: string };

/** One consistent read-only mirror snapshot, without the CLI's .env/fs loader. */
export async function readCloudCatalog(
  databaseUrl: string,
): Promise<CloudCatalogRow[]> {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    prepare: false,
    onnotice: () => undefined,
  });
  try {
    return (await sql.begin(
      "isolation level repeatable read read only",
      async (tx) => {
        await tx`SET LOCAL statement_timeout = '20s'`;
        return await tx<CloudCatalogRow[]>`
        SELECT id, notion_id AS "notionId", title, author,
          publication_year AS "publicationYear", finished::text, abandoned::text,
          cover_url AS "coverUrl", cover_color AS "coverColor",
          last_edited_time::text AS "lastEditedTime"
        FROM books ORDER BY notion_id`;
      },
    )) as unknown as CloudCatalogRow[];
  } finally {
    await sql.end({ timeout: 5 });
  }
}
