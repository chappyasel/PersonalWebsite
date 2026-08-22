/**
 * Backfill script: fetch Audible runtime + page count for books and write
 * them to Notion (source of truth). Notion-only — values flow into the
 * dev/prod databases via the normal sync afterward.
 *
 * Usage:
 *   pnpm add-book-lengths:dry-run          # log what would be written
 *   pnpm add-book-lengths --limit 5        # sanity-check on 5 books
 *   pnpm add-book-lengths                  # full pass
 */
// Load environment variables first
import {
  audibleUrlFromAsin,
  estimatePagesFromAudio,
  fetchAudibleLength,
  fetchPageCount,
  hourDotMinutesToMinutes,
  minutesToHourDotMinutes,
} from "../src/lib/books/lengthFetcher";
import {
  Client,
  type PageObjectResponse,
  type UpdateDataSourceParameters,
} from "@notionhq/client";
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
config({ path: join(__dirname, "../.env") });

// Check required environment variables
if (!process.env.NOTION_API_KEY) {
  throw new Error("NOTION_API_KEY environment variable is required");
}
if (!process.env.NOTION_BOOKS_DATABASE_ID) {
  throw new Error("NOTION_BOOKS_DATABASE_ID environment variable is required");
}

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const idx = process.argv.indexOf("--limit");
  if (idx === -1) return Infinity;
  const value = Number(process.argv[idx + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `--limit requires a positive integer, got: ${process.argv[idx + 1]}`,
    );
  }
  return value;
})();

/**
 * Resolve the data source ID from the books database
 */
async function getDataSourceId(): Promise<string> {
  const database = await notion.databases.retrieve({
    database_id: process.env.NOTION_BOOKS_DATABASE_ID!,
  });

  if (
    "data_sources" in database &&
    Array.isArray(database.data_sources) &&
    database.data_sources.length > 0 &&
    database.data_sources[0]?.id
  ) {
    return database.data_sources[0].id;
  }

  throw new Error("Database has no associated data source");
}

/**
 * Idempotently create the length properties on the data source if missing
 */
async function ensureProperties(dataSourceId: string): Promise<void> {
  const dataSource = await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  });

  const existing =
    "properties" in dataSource ? Object.keys(dataSource.properties) : [];

  type DataSourceProperties = NonNullable<
    UpdateDataSourceParameters["properties"]
  >;
  const wanted = {
    "Audio Length": { number: {} },
    Pages: { number: {} },
    Audible: { url: {} },
  } satisfies DataSourceProperties;

  const missing = (Object.keys(wanted) as Array<keyof typeof wanted>).filter(
    (name) => !existing.includes(name),
  );

  if (missing.length === 0) {
    console.log("✓ All length properties already exist in Notion");
    return;
  }

  console.log(`Creating missing Notion properties: ${missing.join(", ")}`);

  if (DRY_RUN) {
    console.log("  (DRY RUN - not creating)");
    return;
  }

  const properties: DataSourceProperties = {};
  for (const name of missing) properties[name] = wanted[name];

  await notion.dataSources.update({
    data_source_id: dataSourceId,
    properties,
  });

  console.log("✓ Properties created");
}

/**
 * Fetch all book pages from the data source (same filter as sync)
 */
async function fetchAllPages(
  dataSourceId: string,
): Promise<PageObjectResponse[]> {
  const allPages: PageObjectResponse[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        or: [
          { property: "Finished", date: { is_not_empty: true } },
          { property: "Started", date: { is_not_empty: true } },
        ],
      },
      sorts: [{ property: "Finished", direction: "descending" }],
      result_type: "page",
      start_cursor: cursor,
      page_size: 100,
    });

    const pages = response.results.filter(
      (result): result is PageObjectResponse =>
        result.object === "page" && "properties" in result,
    );
    allPages.push(...pages);

    hasMore = response.has_more;
    cursor = response.next_cursor ?? undefined;
  }

  return allPages;
}

type PageProps = PageObjectResponse["properties"];

function extractTitle(props: PageProps): string {
  const prop = props.Title;
  if (
    prop &&
    "title" in prop &&
    Array.isArray(prop.title) &&
    prop.title[0] &&
    "plain_text" in prop.title[0]
  ) {
    return prop.title[0].plain_text;
  }
  return "";
}

function extractAuthor(props: PageProps): string {
  const prop = props.Author;
  if (
    prop &&
    "rich_text" in prop &&
    Array.isArray(prop.rich_text) &&
    prop.rich_text[0] &&
    "plain_text" in prop.rich_text[0]
  ) {
    return prop.rich_text[0].plain_text;
  }
  return "";
}

function extractNumber(props: PageProps, name: string): number | null {
  const prop = props[name];
  return prop && "number" in prop ? (prop.number ?? null) : null;
}

async function main() {
  console.log("=".repeat(60));
  console.log("BOOK LENGTH BACKFILL (Notion-only)");
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
  }
  if (LIMIT !== Infinity) {
    console.log(`\nProcessing at most ${LIMIT} books (--limit)\n`);
  }

  const dataSourceId = await getDataSourceId();
  await ensureProperties(dataSourceId);

  console.log("\nFetching book pages from Notion...");
  const pages = await fetchAllPages(dataSourceId);
  console.log(`Found ${pages.length} book pages\n`);

  let processed = 0;
  let skipped = 0;
  let audioHits = 0;
  let audioMisses = 0;
  let pageHits = 0;
  let pageEstimates = 0;
  let pageMisses = 0;
  let updateFailures = 0;

  for (const page of pages) {
    if (processed >= LIMIT) break;

    const props = page.properties;
    const title = extractTitle(props);
    const author = extractAuthor(props);
    const audioLengthHdm = extractNumber(props, "Audio Length"); // H.MM format
    const pageCount = extractNumber(props, "Pages");

    const needsAudio = audioLengthHdm == null;
    const needsPages = pageCount == null;

    if (!needsAudio && !needsPages) {
      skipped++;
      continue;
    }

    if (!title) {
      console.log(`\n✗ Skipping page ${page.id} — no title`);
      skipped++;
      continue;
    }

    processed++;
    console.log(`\n[${processed}] "${title}" by ${author || "(no author)"}`);

    const properties: Record<
      string,
      { type: "number"; number: number } | { type: "url"; url: string }
    > = {};

    let knownRuntimeMin =
      audioLengthHdm != null ? hourDotMinutesToMinutes(audioLengthHdm) : null;

    if (needsAudio) {
      const audible = await fetchAudibleLength(title, author);
      if (audible) {
        audioHits++;
        console.log(
          `  🎧 Audible: ${audible.runtimeMin} min — "${audible.matchedTitle}" (${audibleUrlFromAsin(audible.asin)})`,
        );
        // Notion stores H.MM (12.32 = 12h 32m), not raw minutes
        properties["Audio Length"] = {
          type: "number",
          number: minutesToHourDotMinutes(audible.runtimeMin),
        };
        properties.Audible = {
          type: "url",
          url: audibleUrlFromAsin(audible.asin),
        };
        knownRuntimeMin = audible.runtimeMin;
      } else {
        audioMisses++;
        console.log(`  ✗ No confident Audible match`);
      }
    }

    if (needsPages) {
      const pageResult = await fetchPageCount(title, author);
      if (pageResult) {
        pageHits++;
        console.log(
          `  📖 Pages: ${pageResult.pageCount} — "${pageResult.matchedTitle}"`,
        );
        properties.Pages = { type: "number", number: pageResult.pageCount };
      } else if (knownRuntimeMin != null) {
        const estimated = estimatePagesFromAudio(knownRuntimeMin);
        pageEstimates++;
        console.log(
          `  📖 Pages (estimated): ${estimated} — from ${knownRuntimeMin} min audio`,
        );
        properties.Pages = { type: "number", number: estimated };
      } else {
        pageMisses++;
        console.log(`  ✗ No confident page-count match`);
      }
    }

    if (Object.keys(properties).length > 0) {
      if (DRY_RUN) {
        console.log(`  (DRY RUN - not updating Notion)`);
      } else {
        try {
          await notion.pages.update({ page_id: page.id, properties });
          console.log(`  ✓ Updated Notion`);
        } catch (error) {
          updateFailures++;
          console.error(`  ✗ Failed to update Notion page ${page.id}:`, error);
        }
      }
    }

    // Small delay to be gentle on the APIs
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total pages in Notion: ${pages.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped (already filled or untitled): ${skipped}`);
  console.log(`🎧 Audio lengths found: ${audioHits} (missed: ${audioMisses})`);
  console.log(
    `📖 Page counts found: ${pageHits}, estimated from audio: ${pageEstimates} (missed: ${pageMisses})`,
  );
  if (updateFailures > 0) {
    console.log(`✗ Notion update failures: ${updateFailures}`);
  }

  if (DRY_RUN) {
    console.log("\n⚠️  This was a DRY RUN - no changes were made");
    console.log("Run without --dry-run to actually update Notion");
  }
}

main()
  .then(() => {
    console.log("\n✓ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Script failed:", error);
    process.exit(1);
  });
