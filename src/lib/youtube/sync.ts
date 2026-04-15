import * as fs from "fs";

import { eq, isNull, sql } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import { ytSyncMetadata, ytWatchHistory } from "~/server/db/schema";

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/videos";
const BATCH_SIZE = 50;
const MAX_DURATION_SECONDS = 5400; // Cap at 90 min to exclude livestreams

type TakeoutEntry = {
  header?: string;
  title?: string;
  titleUrl?: string;
  subtitles?: { name: string; url: string }[];
  time: string;
  products?: string[];
};

type YouTubeApiItem = {
  id: string;
  snippet?: {
    categoryId?: string;
    tags?: string[];
  };
  contentDetails?: {
    duration: string;
    caption?: string; // "true" | "false"
    definition?: string; // "hd" | "sd"
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
  topicDetails?: {
    topicCategories?: string[];
  };
};

type YouTubeApiResponse = {
  items: YouTubeApiItem[];
};

/** All metadata we cache per video ID */
type VideoMeta = {
  durationSeconds: number;
  categoryId: number | null;
  topicCategories: string | null; // JSON stringified array
  tags: string | null; // JSON stringified array
  viewCount: number | null;
  likeCount: number | null;
  hasCaptions: boolean | null;
  definition: string | null;
  llmQualityScore: number | null;
  llmModel: string | null;
  llmPromptVersion: string | null;
};

export type YtSyncResult = {
  totalVideos: number;
  enrichedVideos: number;
  deletedVideos: number;
};

/** Parse ISO 8601 duration (PT1H2M10S) to seconds */
function parseDuration(iso: string): number {
  const time = iso.replace("P", "").replace("T", "");
  let hours = 0,
    minutes = 0,
    seconds = 0;
  let num = "";
  for (const ch of time) {
    if (ch >= "0" && ch <= "9") {
      num += ch;
    } else {
      const val = parseInt(num, 10) || 0;
      if (ch === "H") hours = val;
      else if (ch === "M") minutes = val;
      else if (ch === "S") seconds = val;
      num = "";
    }
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/** Extract video ID from YouTube URL */
function extractVideoId(url: string): string | null {
  const id = url.split("v=")[1]?.split("&")[0];
  if (id?.length === 11) return id;
  return null;
}

/** Fetch full metadata for a batch of video IDs from YouTube Data API v3 */
async function fetchVideoMeta(
  videoIds: string[],
): Promise<Map<string, VideoMeta>> {
  const map = new Map<string, VideoMeta>();
  const url = `${YOUTUBE_API_URL}?part=contentDetails,snippet,statistics,topicDetails&id=${videoIds.join(",")}&key=${env.YOUTUBE_API_KEY}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`YouTube API error: ${resp.status} ${resp.statusText}`);
    return map;
  }

  const data = (await resp.json()) as YouTubeApiResponse;
  for (const item of data.items) {
    const secs = item.contentDetails
      ? Math.min(parseDuration(item.contentDetails.duration), MAX_DURATION_SECONDS)
      : 0;

    map.set(item.id, {
      durationSeconds: secs,
      categoryId: item.snippet?.categoryId
        ? parseInt(item.snippet.categoryId, 10)
        : null,
      topicCategories: item.topicDetails?.topicCategories
        ? JSON.stringify(item.topicDetails.topicCategories)
        : null,
      tags: item.snippet?.tags ? JSON.stringify(item.snippet.tags) : null,
      viewCount: item.statistics?.viewCount
        ? parseInt(item.statistics.viewCount, 10)
        : null,
      likeCount: item.statistics?.likeCount
        ? parseInt(item.statistics.likeCount, 10)
        : null,
      hasCaptions: item.contentDetails?.caption === "true"
        ? true
        : item.contentDetails?.caption === "false"
          ? false
          : null,
      definition: item.contentDetails?.definition ?? null,
      llmQualityScore: null,
      llmModel: null,
      llmPromptVersion: null,
    });
  }
  return map;
}

/**
 * Main sync — reads Google Takeout watch-history.json, enriches with
 * YouTube API metadata, and replaces all yt_watch_history rows.
 */
export async function syncYouTube(
  triggeredBy: "cron" | "manual",
  localFilePath: string,
): Promise<YtSyncResult> {
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
      // Only cache if we have the full metadata (categoryId as sentinel)
      if (row.durationSeconds != null && row.categoryId != null) {
        metaMap.set(row.videoId, {
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
      const batchMeta = await fetchVideoMeta(batch);

      for (const [id, meta] of batchMeta) {
        metaMap.set(id, meta);
        enrichedCount++;
      }

      if ((i / BATCH_SIZE) % 20 === 0) {
        console.log(
          `  Progress: ${Math.min(i + BATCH_SIZE, uncachedIds.length)}/${uncachedIds.length} videos`,
        );
      }
    }

    console.log(
      `Enriched ${enrichedCount}/${uniqueIds.length} videos (${uncachedIds.length} new API calls)`,
    );

    // 4. Full replace — truncate and reinsert
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(ytWatchHistory);

    const DB_BATCH = 500;
    const rows = parsed.map((p) => {
      const meta = metaMap.get(p.videoId);
      return {
        videoId: p.videoId,
        title: p.title,
        channelName: p.channelName,
        channelUrl: p.channelUrl,
        watchedAt: p.watchedAt,
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
      await db.insert(ytWatchHistory).values(batch);
    }

    console.log(`Inserted ${rows.length} watch history entries`);

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
