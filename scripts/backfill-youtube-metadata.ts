// sort-imports-ignore
/**
 * Backfill richer public YouTube metadata for unique videos in watch history.
 *
 * Safe to resume: every attempted video receives youtube_metadata_fetched_at,
 * including videos YouTube no longer returns. By default, subsequent runs only
 * select videos that have not been attempted.
 *
 * Run with:
 *   npx tsx scripts/backfill-youtube-metadata.ts --dry-run
 *   npx tsx scripts/backfill-youtube-metadata.ts
 *   npx tsx scripts/backfill-youtube-metadata.ts --force
 */
import "dotenv/config";

import { drizzle } from "drizzle-orm/postgres-js";
import { isNull, sql } from "drizzle-orm";
import postgres from "postgres";

import { fetchYouTubeVideoMetadata } from "../src/lib/youtube/metadata";
import { ytWatchHistory } from "../src/server/db/schema";

const API_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 6;
const MAX_ATTEMPTS = 3;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

// Local agent sessions default to read-only. This dedicated one-connection
// process opts into writes only for the explicit backfill command.
const connection = postgres(databaseUrl, { max: 1 });
const db = drizzle(connection, { schema: { ytWatchHistory } });

type Options = {
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  concurrency: number;
};

function positiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return parsed;
}

function parseOptions(args: string[]): Options {
  const limitIndex = args.indexOf("--limit");
  const concurrencyIndex = args.indexOf("--concurrency");

  return {
    dryRun: args.includes("--dry-run"),
    force: args.includes("--force"),
    limit:
      limitIndex === -1
        ? null
        : positiveInteger(args[limitIndex + 1], "--limit"),
    concurrency:
      concurrencyIndex === -1
        ? DEFAULT_CONCURRENCY
        : positiveInteger(args[concurrencyIndex + 1], "--concurrency"),
  };
}

function batchesOf<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function fetchWithRetry(videoIds: string[]) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");
      return await fetchYouTubeVideoMetadata(videoIds, apiKey);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * 2 ** (attempt - 1)),
      );
    }
  }

  throw lastError;
}

async function persistBatch(videoIds: string[], fetchedAt: Date) {
  const metadata = await fetchWithRetry(videoIds);
  const records = videoIds.map((videoId) => {
    const item = metadata.get(videoId);
    return {
      video_id: videoId,
      available: Boolean(item),
      canonical_title: item?.title ?? null,
      canonical_channel_name: item?.channelName ?? null,
      youtube_channel_id: item?.youtubeChannelId ?? null,
      description: item?.description ?? null,
      thumbnail_url: item?.thumbnailUrl ?? null,
      duration_seconds: item?.durationSeconds ?? null,
      category_id: item?.categoryId ?? null,
      topic_categories: item?.topicCategories ?? null,
      tags: item?.tags ?? null,
      view_count: item?.viewCount ?? null,
      like_count: item?.likeCount ?? null,
      has_captions: item?.hasCaptions ?? null,
      definition: item?.definition ?? null,
      fetched_at: fetchedAt.toISOString(),
    };
  });

  await db.execute(sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(
        (${JSON.stringify(records)}::jsonb #>> '{}')::jsonb
      ) AS x(
        video_id text,
        available boolean,
        canonical_title text,
        canonical_channel_name text,
        youtube_channel_id text,
        description text,
        thumbnail_url text,
        duration_seconds integer,
        category_id integer,
        topic_categories text,
        tags text,
        view_count double precision,
        like_count double precision,
        has_captions boolean,
        definition text,
        fetched_at timestamptz
      )
    )
    UPDATE ${ytWatchHistory} AS target
    SET
      title = CASE
        WHEN incoming.available AND (
          target.title IS NULL OR
          target.title LIKE 'https://www.youtube.com/watch%'
        )
          THEN COALESCE(incoming.canonical_title, target.title)
        ELSE target.title
      END,
      channel_name = CASE
        WHEN incoming.available AND (
          target.channel_name IS NULL OR target.channel_name = ''
        )
          THEN COALESCE(incoming.canonical_channel_name, target.channel_name)
        ELSE target.channel_name
      END,
      description = CASE
        WHEN incoming.available THEN incoming.description
        ELSE target.description
      END,
      thumbnail_url = CASE
        WHEN incoming.available THEN incoming.thumbnail_url
        ELSE target.thumbnail_url
      END,
      duration_seconds = CASE
        WHEN incoming.available
          THEN COALESCE(incoming.duration_seconds, target.duration_seconds)
        ELSE target.duration_seconds
      END,
      category_id = CASE
        WHEN incoming.available
          THEN COALESCE(incoming.category_id, target.category_id)
        ELSE target.category_id
      END,
      topic_categories = CASE
        WHEN incoming.available
          THEN COALESCE(incoming.topic_categories, target.topic_categories)
        ELSE target.topic_categories
      END,
      tags = CASE
        WHEN incoming.available THEN COALESCE(incoming.tags, target.tags)
        ELSE target.tags
      END,
      view_count = CASE
        WHEN incoming.available
          THEN COALESCE(incoming.view_count, target.view_count)
        ELSE target.view_count
      END,
      like_count = CASE
        WHEN incoming.available
          THEN COALESCE(incoming.like_count, target.like_count)
        ELSE target.like_count
      END,
      has_captions = CASE
        WHEN incoming.available
          THEN COALESCE(incoming.has_captions, target.has_captions)
        ELSE target.has_captions
      END,
      definition = CASE
        WHEN incoming.available
          THEN COALESCE(incoming.definition, target.definition)
        ELSE target.definition
      END,
      youtube_metadata_fetched_at = incoming.fetched_at
    FROM incoming
    WHERE target.video_id = incoming.video_id
  `);

  await db.execute(sql`
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(
        (${JSON.stringify(records)}::jsonb #>> '{}')::jsonb
      ) AS x(
        video_id text,
        available boolean,
        canonical_title text,
        canonical_channel_name text,
        youtube_channel_id text,
        description text,
        thumbnail_url text,
        duration_seconds integer,
        category_id integer,
        topic_categories text,
        tags text,
        view_count double precision,
        like_count double precision,
        has_captions boolean,
        definition text,
        fetched_at timestamptz
      )
    ), inserted_channels AS (
      INSERT INTO yt_channels (
        youtube_channel_id, name, url, metadata_fetched_at, updated_at
      )
      SELECT DISTINCT ON (youtube_channel_id)
        youtube_channel_id,
        canonical_channel_name,
        'https://www.youtube.com/channel/' || youtube_channel_id,
        fetched_at,
        NOW()
      FROM incoming
      WHERE available
        AND youtube_channel_id IS NOT NULL
        AND canonical_channel_name IS NOT NULL
      ORDER BY youtube_channel_id
      ON CONFLICT (youtube_channel_id) DO UPDATE SET
        name = EXCLUDED.name,
        url = EXCLUDED.url,
        metadata_fetched_at = EXCLUDED.metadata_fetched_at,
        updated_at = NOW()
      RETURNING id, youtube_channel_id
    )
    INSERT INTO yt_videos (
      video_id, channel_id, title, description, thumbnail_url,
      duration_seconds, category_id, topic_categories, tags, view_count,
      like_count, has_captions, definition, metadata_fetched_at, updated_at
    )
    SELECT
      incoming.video_id,
      channel.id,
      incoming.canonical_title,
      incoming.description,
      incoming.thumbnail_url,
      incoming.duration_seconds,
      incoming.category_id,
      incoming.topic_categories,
      incoming.tags,
      incoming.view_count,
      incoming.like_count,
      incoming.has_captions,
      incoming.definition,
      incoming.fetched_at,
      NOW()
    FROM incoming
    LEFT JOIN LATERAL (
      SELECT possible.id
      FROM (
        SELECT id, youtube_channel_id FROM inserted_channels
        UNION ALL
        SELECT id, youtube_channel_id FROM yt_channels
      ) possible
      WHERE possible.youtube_channel_id = incoming.youtube_channel_id
      LIMIT 1
    ) channel ON TRUE
    WHERE incoming.available
    ON CONFLICT (video_id) DO UPDATE SET
      channel_id = COALESCE(EXCLUDED.channel_id, yt_videos.channel_id),
      title = COALESCE(EXCLUDED.title, yt_videos.title),
      description = EXCLUDED.description,
      thumbnail_url = EXCLUDED.thumbnail_url,
      duration_seconds = COALESCE(EXCLUDED.duration_seconds, yt_videos.duration_seconds),
      category_id = COALESCE(EXCLUDED.category_id, yt_videos.category_id),
      topic_categories = COALESCE(EXCLUDED.topic_categories, yt_videos.topic_categories),
      tags = COALESCE(EXCLUDED.tags, yt_videos.tags),
      view_count = COALESCE(EXCLUDED.view_count, yt_videos.view_count),
      like_count = COALESCE(EXCLUDED.like_count, yt_videos.like_count),
      has_captions = COALESCE(EXCLUDED.has_captions, yt_videos.has_captions),
      definition = COALESCE(EXCLUDED.definition, yt_videos.definition),
      metadata_fetched_at = EXCLUDED.metadata_fetched_at,
      updated_at = NOW()
  `);

  return {
    available: metadata.size,
    unavailable: videoIds.length - metadata.size,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  await connection.unsafe("SET default_transaction_read_only = off");

  const baseQuery = db
    .selectDistinct({ videoId: ytWatchHistory.videoId })
    .from(ytWatchHistory)
    .$dynamic();
  const rows = options.force
    ? await baseQuery
    : await baseQuery.where(isNull(ytWatchHistory.youtubeMetadataFetchedAt));
  const allVideoIds = rows.map((row) => row.videoId).sort();
  const videoIds =
    options.limit == null ? allVideoIds : allVideoIds.slice(0, options.limit);

  console.log(
    `${videoIds.length} unique videos to backfill` +
      `${options.force ? " (forced refresh)" : ""}` +
      `${options.limit ? ` (limited from ${allVideoIds.length})` : ""}`,
  );

  if (options.dryRun || videoIds.length === 0) {
    if (options.dryRun) console.log("Dry run; no API or database writes made.");
    return;
  }

  const batches = batchesOf(videoIds, API_BATCH_SIZE);
  let nextBatch = 0;
  let completedBatches = 0;
  let available = 0;
  let unavailable = 0;

  async function worker() {
    while (true) {
      const batchIndex = nextBatch++;
      const batch = batches[batchIndex];
      if (!batch) return;

      const result = await persistBatch(batch, new Date());
      available += result.available;
      unavailable += result.unavailable;
      completedBatches++;

      if (completedBatches % 20 === 0 || completedBatches === batches.length) {
        console.log(
          `Progress: ${completedBatches}/${batches.length} batches; ` +
            `${available} available, ${unavailable} unavailable`,
        );
      }
    }
  }

  const workerCount = Math.min(options.concurrency, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  console.log(
    `Done. Backfilled ${available} videos; marked ${unavailable} unavailable.`,
  );
}

main()
  .then(async () => {
    await connection.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(
      `Metadata backfill failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    await connection.end();
    process.exit(1);
  });
