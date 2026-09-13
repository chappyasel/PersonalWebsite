import { Client, isFullBlock, isFullPage } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

export const MUSINGS_DATA_SOURCE = "281555af-6569-458b-996c-3e4b8e8a7eec";
export const MUSINGS_DATABASE = "df385043-90e7-44ca-a79b-a3d03b7a047a";
export const publicationFilter = {
  and: [
    { property: "Musing", checkbox: { equals: true } },
    { property: "Status", status: { equals: "Posted" } },
  ],
};

export function notionClient() {
  if (!process.env.NOTION_API_KEY)
    throw new Error(
      "NOTION_API_KEY is required. Load the site's environment file.",
    );
  return new Client({
    auth: process.env.NOTION_API_KEY,
    logger: () => {},
    // Avoid reusing a socket that the local credential proxy has closed
    // between multipart uploads. No API mutation is silently retried.
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        headers: { ...init?.headers, Connection: "close" },
      }),
  });
}

// Writes are not retried on ambiguous network/server errors. The importer
// reconciles them against the saved page and source URL before resuming.
export async function limited<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      return await operation();
    } catch (error) {
      const e = error as {
        status?: number;
        headers?: { get?: (name: string) => string | null };
      };
      if (![429, 529].includes(e.status ?? 0) || attempt >= 5) throw error;
      const seconds = Number(e.headers?.get?.("retry-after") ?? 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
  }
}

export async function queryPages(
  client: Client,
  publishedOnly = false,
): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    const result = await limited(() =>
      client.dataSources.query({
        data_source_id: MUSINGS_DATA_SOURCE,
        page_size: 100,
        ...(publishedOnly ? { filter: publicationFilter } : {}),
        start_cursor: cursor,
      }),
    );
    pages.push(...result.results.filter(isFullPage));
    cursor = result.has_more ? (result.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return pages;
}

export type BlockTree = BlockObjectResponse & { children?: BlockTree[] };
export async function readBlocks(
  client: Client,
  id: string,
): Promise<BlockTree[]> {
  const blocks: BlockTree[] = [];
  let cursor: string | undefined;
  do {
    const result = await limited(() =>
      client.blocks.children.list({
        block_id: id,
        page_size: 100,
        start_cursor: cursor,
      }),
    );
    for (const block of result.results) {
      if (!isFullBlock(block))
        throw new Error(`Incomplete Notion block in ${id}`);
      const children = block.has_children
        ? await readBlocks(client, block.id)
        : undefined;
      blocks.push({ ...block, ...(children ? { children } : {}) });
    }
    cursor = result.has_more ? (result.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return blocks;
}
