import { persistImages } from "./noteImages";
import { createBookNotionClient } from "./notionClient";
import { notionPageIdFromUrl } from "./notionLinks";
import { convertNotionMarkdown, mentionedPageUrls } from "./notionMarkdown";

/** The first API version with the page-markdown endpoint. */
const MARKDOWN_API_VERSION = "2026-03-11";

const notion = createBookNotionClient(MARKDOWN_API_VERSION);

type PageMarkdown = {
  markdown: string;
  truncated: boolean;
  unknown_block_ids: string[];
};

type RichText = {
  type: string;
  href?: string | null;
  mention?: { type: string };
};

type ChildBlock = {
  id: string;
  type: string;
  has_children: boolean;
  numbered_list_item?: {
    list_start_index?: number;
  };
  /** The block's own content, under its type's key. */
  [type: string]: unknown;
};

async function childBlocks(blockId: string): Promise<ChildBlock[]> {
  const blocks: ChildBlock[] = [];
  let cursor: string | undefined;
  do {
    const page = (await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    })) as unknown as { results: ChildBlock[]; next_cursor: string | null };
    blocks.push(...page.results);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return blocks;
}

/**
 * The block at each sibling path (`"12/0/3"`), found by walking only the
 * parents on the path. A path that runs out of blocks is left out.
 */
async function blocksAtPaths(
  pageId: string,
  paths: string[],
): Promise<Map<string, ChildBlock>> {
  const children = new Map<string, Promise<ChildBlock[]>>();
  const childrenOf = (blockId: string) => {
    let pending = children.get(blockId);
    if (!pending) {
      pending = childBlocks(blockId);
      children.set(blockId, pending);
    }
    return pending;
  };
  const found = new Map<string, ChildBlock>();
  for (const path of new Set(paths)) {
    let parentId = pageId;
    let block: ChildBlock | undefined;
    for (const index of path.split("/").map(Number)) {
      if (block && !block.has_children) {
        block = undefined;
        break;
      }
      if (block) parentId = block.id;
      block = (await childrenOf(parentId))[index];
      if (!block) break;
    }
    if (block) found.set(path, block);
  }
  return found;
}

/**
 * Notion's start number for each numbered item that resumes a list. An item
 * whose path does not land on a numbered item is left out, so it keeps the
 * endpoint's number.
 */
function listStarts(
  pageId: string,
  paths: string[],
  blocks: ReadonlyMap<string, ChildBlock>,
): Map<string, number> {
  const starts = new Map<string, number>();
  for (const path of paths) {
    const block = blocks.get(path);
    const start = block?.numbered_list_item?.list_start_index;
    if (block?.type === "numbered_list_item" && start) starts.set(path, start);
    else if (block?.type !== "numbered_list_item") {
      console.warn(
        `  ✗ List path ${path} on ${pageId} is a ${block?.type ?? "missing block"}; keeping the endpoint's number`,
      );
    }
  }
  return starts;
}

/**
 * The addresses each block holds as link mentions, by the block's path. A
 * path that lands on no block, or on one with no web link at all, means the
 * walk and the endpoint disagree about the page (an edit landed between the
 * two reads); its links stay plain and the next sync, which that edit
 * triggers, marks them.
 */
function linkMentions(
  pageId: string,
  paths: string[],
  blocks: ReadonlyMap<string, ChildBlock>,
): Map<string, Set<string>> {
  const mentions = new Map<string, Set<string>>();
  for (const path of paths) {
    const block = blocks.get(path);
    const content = block?.[block.type] as
      | { rich_text?: RichText[] }
      | undefined;
    const richText = content?.rich_text ?? [];
    if (!richText.some((text) => text.href)) {
      console.warn(
        `  ✗ Link path ${path} on ${pageId} is a ${block?.type ?? "missing block"} with no links; leaving its links unmarked`,
      );
      continue;
    }
    const hrefs = new Set(
      richText
        .filter((text) => text.mention?.type === "link_mention")
        .map((text) => text.href)
        .filter((href): href is string => Boolean(href)),
    );
    if (hrefs.size) mentions.set(path, hrefs);
  }
  return mentions;
}

/** A page's title, for a mention of a page outside the library. */
async function pageTitle(pageId: string): Promise<string | undefined> {
  try {
    const page = (await notion.pages.retrieve({ page_id: pageId })) as {
      properties?: Record<
        string,
        { type: string; title?: { plain_text: string }[] }
      >;
    };
    const title = Object.values(page.properties ?? {}).find(
      (property) => property.type === "title",
    );
    const text = title?.title?.map((part) => part.plain_text).join("");
    return text === "" ? undefined : text;
  } catch {
    // No access to the page: the link falls back to its address.
    return undefined;
  }
}

/**
 * A book's notes from Notion's page-markdown endpoint, in the renderer's
 * Markdown, or null when this page needs the block-by-block walk instead:
 * a truncated page, blocks the integration cannot read, or a tag the
 * converter does not know.
 *
 * Costs one request, plus one per unresolved mention and a few for any
 * numbered list that resumes after other blocks or web link on words.
 */
export async function fetchNotesFromMarkdown(
  pageId: string,
  titleByNotionId: ReadonlyMap<string, string> = new Map(),
): Promise<string | null> {
  const page = await notion.request<PageMarkdown>({
    path: `pages/${pageId}/markdown`,
    method: "get",
  });
  if (page.truncated || page.unknown_block_ids.length) {
    console.warn(
      `  ✗ Markdown for ${pageId} is incomplete (${page.unknown_block_ids.length} unreadable blocks); walking blocks instead`,
    );
    return null;
  }

  const titles = new Map<string, string>();
  for (const url of mentionedPageUrls(page.markdown)) {
    const id = notionPageIdFromUrl(url);
    const title = id
      ? (titleByNotionId.get(id) ?? (await pageTitle(id)))
      : undefined;
    if (title) titles.set(url, title);
  }
  const titleOf = (url: string) => titles.get(url);

  let converted = convertNotionMarkdown(page.markdown, { titleOf });
  const { resumedListPaths, linkPaths } = converted;
  if (resumedListPaths.length || linkPaths.length) {
    const blocks = await blocksAtPaths(pageId, [
      ...resumedListPaths,
      ...linkPaths,
    ]);
    const starts = listStarts(pageId, resumedListPaths, blocks);
    const mentions = linkMentions(pageId, linkPaths, blocks);
    converted = convertNotionMarkdown(page.markdown, {
      titleOf,
      listStartAt: (path) => starts.get(path),
      linkMentionsAt: (path) => mentions.get(path),
    });
  }
  if (converted.unsupported.length) {
    console.warn(
      `  ✗ Markdown for ${pageId} has unsupported tags (${converted.unsupported.join(", ")}); walking blocks instead`,
    );
    return null;
  }
  return persistImages(converted.markdown);
}
