import * as fs from "fs";

import { eq } from "drizzle-orm";

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

type YouTubeApiResponse = {
  items: {
    id: string;
    contentDetails: {
      duration: string; // ISO 8601 e.g. "PT1H2M10S"
    };
  }[];
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

/** Fetch durations for a batch of video IDs from YouTube Data API v3 */
async function fetchDurations(
  videoIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const url = `${YOUTUBE_API_URL}?part=contentDetails&id=${videoIds.join(",")}&key=${env.YOUTUBE_API_KEY}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`YouTube API error: ${resp.status} ${resp.statusText}`);
    return map;
  }

  const data = (await resp.json()) as YouTubeApiResponse;
  for (const item of data.items) {
    const secs = parseDuration(item.contentDetails.duration);
    map.set(item.id, Math.min(secs, MAX_DURATION_SECONDS));
  }
  return map;
}

/**
 * Main sync — reads Google Takeout watch-history.json, enriches with
 * YouTube API durations, and replaces all yt_watch_history rows.
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

    // 3. Collect unique video IDs and fetch durations in batches
    const uniqueIds = [...new Set(parsed.map((p) => p.videoId))];
    const durationMap = new Map<string, number>();
    let enrichedCount = 0;

    console.log(
      `Fetching durations for ${uniqueIds.length} unique videos in batches of ${BATCH_SIZE}...`,
    );

    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
      const batch = uniqueIds.slice(i, i + BATCH_SIZE);
      const batchDurations = await fetchDurations(batch);

      for (const [id, dur] of batchDurations) {
        durationMap.set(id, dur);
        enrichedCount++;
      }

      if ((i / BATCH_SIZE) % 20 === 0) {
        console.log(
          `  Progress: ${Math.min(i + BATCH_SIZE, uniqueIds.length)}/${uniqueIds.length} videos`,
        );
      }
    }

    console.log(`Enriched ${enrichedCount}/${uniqueIds.length} videos`);

    // 4. Full replace — truncate and reinsert
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    await db.delete(ytWatchHistory);

    const DB_BATCH = 500;
    const rows = parsed.map((p) => ({
      videoId: p.videoId,
      title: p.title,
      channelName: p.channelName,
      channelUrl: p.channelUrl,
      watchedAt: p.watchedAt,
      durationSeconds: durationMap.get(p.videoId) ?? null,
    }));

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
