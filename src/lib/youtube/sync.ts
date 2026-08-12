import { eq, sql } from "drizzle-orm";
import * as fs from "fs";

import {
  type YouTubeVideoMetadata,
  fetchYouTubeVideoMetadata,
  preferCanonicalMetadata,
} from "~/lib/youtube/metadata";
import { db } from "~/server/db";
import { ytSyncMetadata, ytWatchHistory } from "~/server/db/schema";

import { env } from "~/env";

const BATCH_SIZE = 50;

type TakeoutEntry = {
  header?: string;
  title?: string;
  titleUrl?: string;
  subtitles?: { name: string; url: string }[];
  time: string;
  products?: string[];
};

/** All metadata we cache per video ID */
type VideoMeta = YouTubeVideoMetadata & {
  youtubeMetadataFetchedAt: Date | null;
  llmQualityScore: number | null;
  llmModel: string | null;
  llmPromptVersion: string | null;
};

export type YtSyncResult = {
  totalVideos: number;
  enrichedVideos: number;
  deletedVideos: number;
};

/** Extract video ID from YouTube URL */
function extractVideoId(url: string): string | null {
  const id = url.split("v=")[1]?.split("&")[0];
  if (id?.length === 11) return id;
  return null;
}

/**
 * Main sync — reads Google Takeout watch-history.json, enriches with
 * YouTube API metadata, and replaces all yt_watch_history rows.
 */
export async function syncYouTube(
  triggeredBy: "cron" | "manual",
  localFilePath: string,
): Promise<YtSyncResult> {
  // Agent-launched database sessions default to read-only. This command is an
  // explicit ingestion path, so opt its connection into writes before creating
  // the sync record.
  await db.execute(sql`SET default_transaction_read_only = off`);
  const syncId = await createSyncRecord(triggeredBy);

  try {
    // 1. Read and parse Takeout JSON
    console.log("Reading YouTube Takeout JSON...");
    const raw = fs.readFileSync(localFilePath, "utf-8");
    const entries = JSON.parse(raw) as TakeoutEntry[];

    // 2. Parse entries — extract video IDs and metadata
    type ParsedEntry = {
      videoId: string;
      title: string | null;
      channelName: string | null;
      channelUrl: string | null;
      watchedAt: Date;
    };
    const parsed: ParsedEntry[] = [];
    let deletedCount = 0;

    for (const entry of entries) {
      if (!entry.titleUrl) {
        deletedCount++;
        continue;
      }

      const videoId = extractVideoId(entry.titleUrl);
      if (!videoId) continue;

      const title = entry.title?.replace(/^Watched\s+/, "") ?? null;

      parsed.push({
        videoId,
        title,
        channelName: entry.subtitles?.[0]?.name ?? null,
        channelUrl: entry.subtitles?.[0]?.url ?? null,
        watchedAt: new Date(entry.time),
      });
    }

    console.log(
      `Parsed ${parsed.length} videos, ${deletedCount} deleted/unavailable`,
    );

    // 3. Load cached metadata from existing DB rows before we delete them
    const uniqueIds = [...new Set(parsed.map((p) => p.videoId))];
    const metaMap = new Map<string, VideoMeta>();

    const existingRows = await db
      .select({
        videoId: ytWatchHistory.videoId,
        title: ytWatchHistory.title,
        channelName: ytWatchHistory.channelName,
        description: ytWatchHistory.description,
        thumbnailUrl: ytWatchHistory.thumbnailUrl,
        youtubeMetadataFetchedAt: ytWatchHistory.youtubeMetadataFetchedAt,
        durationSeconds: ytWatchHistory.durationSeconds,
        categoryId: ytWatchHistory.categoryId,
        topicCategories: ytWatchHistory.topicCategories,
        tags: ytWatchHistory.tags,
        viewCount: ytWatchHistory.viewCount,
        likeCount: ytWatchHistory.likeCount,
        hasCaptions: ytWatchHistory.hasCaptions,
        definition: ytWatchHistory.definition,
        llmQualityScore: ytWatchHistory.llmQualityScore,
        llmModel: ytWatchHistory.llmModel,
        llmPromptVersion: ytWatchHistory.llmPromptVersion,
      })
      .from(ytWatchHistory);

    for (const row of existingRows) {
      // A fetch timestamp is the sentinel for the richer metadata version.
      if (
        row.durationSeconds != null &&
        row.categoryId != null &&
        row.youtubeMetadataFetchedAt != null
      ) {
        metaMap.set(row.videoId, {
          youtubeChannelId: null,
          title: row.title,
          channelName: row.channelName,
          description: row.description,
          thumbnailUrl: row.thumbnailUrl,
          youtubeMetadataFetchedAt: row.youtubeMetadataFetchedAt,
          durationSeconds: row.durationSeconds,
          categoryId: row.categoryId,
          topicCategories: row.topicCategories,
          tags: row.tags,
          viewCount: row.viewCount,
          likeCount: row.likeCount,
          hasCaptions: row.hasCaptions,
          definition: row.definition,
          llmQualityScore: row.llmQualityScore,
          llmModel: row.llmModel,
          llmPromptVersion: row.llmPromptVersion,
        });
      }
    }

    const uncachedIds = uniqueIds.filter((id) => !metaMap.has(id));
    let enrichedCount = metaMap.size;

    console.log(
      `${metaMap.size} cached, ${uncachedIds.length} to fetch from API...`,
    );

    // Fetch metadata only for uncached videos
    for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
      const batch = uncachedIds.slice(i, i + BATCH_SIZE);
      const fetchedAt = new Date();
      const batchMeta = await fetchYouTubeVideoMetadata(
        batch,
        env.YOUTUBE_API_KEY,
      );

      for (const [id, meta] of batchMeta) {
        metaMap.set(id, {
          ...meta,
          youtubeMetadataFetchedAt: fetchedAt,
          llmQualityScore: null,
          llmModel: null,
          llmPromptVersion: null,
        });
        enrichedCount++;
      }

      if ((i / BATCH_SIZE) % 20 === 0) {
        console.log(
          `  Progress: ${Math.min(i + BATCH_SIZE, uncachedIds.length)}/${uncachedIds.length} videos`,
        );
      }
    }

    console.log(
      `Enriched ${enrichedCount}/${uniqueIds.length} videos (${Math.ceil(uncachedIds.length / BATCH_SIZE)} API batches)`,
    );

    // 4. Additive upsert — never destroy existing rows. Unique key is
    // (video_id, watched_at), enforced by yt_watch_event_uq index. If a row
    // with that pair exists, update its metadata to refresh enrichment;
    // otherwise insert.
    const DB_BATCH = 500;
    const rows = parsed.map((p) => {
      const meta = metaMap.get(p.videoId);
      return {
        videoId: p.videoId,
        youtubeChannelId: meta?.youtubeChannelId ?? null,
        title: preferCanonicalMetadata(p.title, meta?.title),
        channelName: preferCanonicalMetadata(p.channelName, meta?.channelName),
        channelUrl: p.channelUrl,
        watchedAt: p.watchedAt,
        description: meta?.description ?? null,
        thumbnailUrl: meta?.thumbnailUrl ?? null,
        youtubeMetadataFetchedAt: meta?.youtubeMetadataFetchedAt ?? null,
        durationSeconds: meta?.durationSeconds ?? null,
        categoryId: meta?.categoryId ?? null,
        topicCategories: meta?.topicCategories ?? null,
        tags: meta?.tags ?? null,
        viewCount: meta?.viewCount ?? null,
        likeCount: meta?.likeCount ?? null,
        hasCaptions: meta?.hasCaptions ?? null,
        definition: meta?.definition ?? null,
        llmQualityScore: meta?.llmQualityScore ?? null,
        llmModel: meta?.llmModel ?? null,
        llmPromptVersion: meta?.llmPromptVersion ?? null,
      };
    });

    for (let i = 0; i < rows.length; i += DB_BATCH) {
      const batch = rows.slice(i, i + DB_BATCH);
      await db
        .insert(ytWatchHistory)
        .values(batch)
        .onConflictDoUpdate({
          target: [ytWatchHistory.videoId, ytWatchHistory.watchedAt],
          set: {
            title: sql`excluded.title`,
            channelName: sql`excluded.channel_name`,
            channelUrl: sql`excluded.channel_url`,
            description: sql`excluded.description`,
            thumbnailUrl: sql`excluded.thumbnail_url`,
            youtubeMetadataFetchedAt: sql`excluded.youtube_metadata_fetched_at`,
            durationSeconds: sql`excluded.duration_seconds`,
            categoryId: sql`excluded.category_id`,
            topicCategories: sql`excluded.topic_categories`,
            tags: sql`excluded.tags`,
            viewCount: sql`excluded.view_count`,
            likeCount: sql`excluded.like_count`,
            hasCaptions: sql`excluded.has_captions`,
            definition: sql`excluded.definition`,
          },
        });
    }

    // Keep the normalized entities current while the legacy history table
    // remains available for side-by-side score comparison.
    for (let i = 0; i < rows.length; i += DB_BATCH) {
      const batch = rows.slice(i, i + DB_BATCH);
      const normalized = batch.map((row) => ({
        video_id: row.videoId,
        youtube_channel_id: row.youtubeChannelId,
        channel_name: row.channelName,
        channel_url: row.channelUrl,
        watched_at: row.watchedAt.toISOString(),
        title: row.title,
        description: row.description,
        thumbnail_url: row.thumbnailUrl,
        duration_seconds: row.durationSeconds,
        category_id: row.categoryId,
        topic_categories: row.topicCategories,
        tags: row.tags,
        view_count: row.viewCount,
        like_count: row.likeCount,
        has_captions: row.hasCaptions,
        definition: row.definition,
        metadata_fetched_at:
          row.youtubeMetadataFetchedAt?.toISOString() ?? null,
      }));
      await db.execute(sql`
        WITH incoming AS (
          SELECT * FROM jsonb_to_recordset(
            (${JSON.stringify(normalized)}::jsonb #>> '{}')::jsonb
          ) AS x(
            video_id text, youtube_channel_id text, channel_name text,
            channel_url text, watched_at timestamptz, title text,
            description text, thumbnail_url text, duration_seconds integer,
            category_id integer, topic_categories text, tags text,
            view_count double precision, like_count double precision,
            has_captions boolean, definition text,
            metadata_fetched_at timestamptz
          )
        ), identified_channels AS (
          INSERT INTO yt_channels (
            youtube_channel_id, name, url, metadata_fetched_at, updated_at
          )
          SELECT DISTINCT ON (youtube_channel_id)
            youtube_channel_id,
            COALESCE(channel_name, 'Unknown'),
            COALESCE(
              channel_url,
              'https://www.youtube.com/channel/' || youtube_channel_id
            ),
            metadata_fetched_at,
            NOW()
          FROM incoming
          WHERE youtube_channel_id IS NOT NULL
          ORDER BY youtube_channel_id, watched_at DESC
          ON CONFLICT (youtube_channel_id) DO UPDATE SET
            name = EXCLUDED.name,
            url = EXCLUDED.url,
            metadata_fetched_at = COALESCE(
              EXCLUDED.metadata_fetched_at,
              yt_channels.metadata_fetched_at
            ),
            updated_at = NOW()
          RETURNING id, youtube_channel_id
        ), upserted_videos AS (
          INSERT INTO yt_videos (
            video_id, channel_id, title, description, thumbnail_url,
            duration_seconds, category_id, topic_categories, tags, view_count,
            like_count, has_captions, definition, metadata_fetched_at, updated_at
          )
          SELECT DISTINCT ON (incoming.video_id)
            incoming.video_id,
            channel.id,
            incoming.title,
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
            incoming.metadata_fetched_at,
            NOW()
          FROM incoming
          LEFT JOIN LATERAL (
            SELECT possible.id
            FROM (
              SELECT id, youtube_channel_id FROM identified_channels
              UNION ALL
              SELECT id, youtube_channel_id FROM yt_channels
            ) possible
            WHERE possible.youtube_channel_id = incoming.youtube_channel_id
            LIMIT 1
          ) channel ON TRUE
          ORDER BY incoming.video_id, incoming.watched_at DESC
          ON CONFLICT (video_id) DO UPDATE SET
            channel_id = COALESCE(EXCLUDED.channel_id, yt_videos.channel_id),
            title = COALESCE(EXCLUDED.title, yt_videos.title),
            description = COALESCE(EXCLUDED.description, yt_videos.description),
            thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, yt_videos.thumbnail_url),
            duration_seconds = COALESCE(EXCLUDED.duration_seconds, yt_videos.duration_seconds),
            category_id = COALESCE(EXCLUDED.category_id, yt_videos.category_id),
            topic_categories = COALESCE(EXCLUDED.topic_categories, yt_videos.topic_categories),
            tags = COALESCE(EXCLUDED.tags, yt_videos.tags),
            view_count = COALESCE(EXCLUDED.view_count, yt_videos.view_count),
            like_count = COALESCE(EXCLUDED.like_count, yt_videos.like_count),
            has_captions = COALESCE(EXCLUDED.has_captions, yt_videos.has_captions),
            definition = COALESCE(EXCLUDED.definition, yt_videos.definition),
            metadata_fetched_at = COALESCE(EXCLUDED.metadata_fetched_at, yt_videos.metadata_fetched_at),
            updated_at = NOW()
          RETURNING video_id
        )
        INSERT INTO yt_watch_events (video_id, watched_at)
        SELECT video_id, watched_at FROM incoming
        ON CONFLICT (video_id, watched_at) DO NOTHING
      `);
    }

    console.log(`Upserted ${rows.length} watch history entries`);

    const result: YtSyncResult = {
      totalVideos: parsed.length,
      enrichedVideos: enrichedCount,
      deletedVideos: deletedCount,
    };

    await completeSyncRecord(syncId, "success", result);
    return result;
  } catch (error) {
    console.error("YouTube sync failed:", error);
    await completeSyncRecord(syncId, "failed", null, error);
    throw error;
  }
}

async function createSyncRecord(
  triggeredBy: "cron" | "manual",
): Promise<number> {
  const [record] = await db
    .insert(ytSyncMetadata)
    .values({ status: "in_progress", triggeredBy })
    .returning({ id: ytSyncMetadata.id });
  return record!.id;
}

async function completeSyncRecord(
  syncId: number,
  status: "success" | "failed",
  result: YtSyncResult | null,
  error?: unknown,
): Promise<void> {
  await db
    .update(ytSyncMetadata)
    .set({
      syncCompletedAt: new Date(),
      status,
      totalVideos: result?.totalVideos ?? null,
      enrichedVideos: result?.enrichedVideos ?? null,
      deletedVideos: result?.deletedVideos ?? null,
      errors: error
        ? JSON.stringify([
            error instanceof Error ? error.message : "Unknown error",
          ])
        : null,
    })
    .where(eq(ytSyncMetadata.id, syncId));
}
