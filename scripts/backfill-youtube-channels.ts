/** Refresh YouTube channel names and avatars. Safe to resume. */
import { fetchYouTubeChannelMetadata } from "../src/lib/youtube/metadata";
import { ytChannels } from "../src/server/db/schema";
import "dotenv/config";
import { isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const apiKey = process.env.YOUTUBE_API_KEY;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");
const youtubeApiKey = apiKey;

const connection = postgres(databaseUrl, { max: 1 });
const db = drizzle(connection);
const BATCH_SIZE = 50;

async function main() {
  const force = process.argv.includes("--force");
  const execute = process.argv.includes("--execute");
  const staleBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const base = db
    .select({ youtubeChannelId: ytChannels.youtubeChannelId })
    .from(ytChannels)
    .$dynamic();
  const rows = force
    ? await base.where(isNotNull(ytChannels.youtubeChannelId))
    : await base.where(
        sql`${ytChannels.youtubeChannelId} IS NOT NULL AND (${or(
          isNull(ytChannels.thumbnailUrl),
          isNull(ytChannels.metadataFetchedAt),
          lt(ytChannels.metadataFetchedAt, staleBefore),
        )})`,
      );
  const channelIds = rows
    .map((row) => row.youtubeChannelId)
    .filter((id): id is string => id !== null);
  console.log(
    `${channelIds.length} channels to refresh (${Math.ceil(channelIds.length / BATCH_SIZE)} quota units)`,
  );
  if (!execute) {
    console.log("Preflight only. Add --execute to fetch and write.");
    return;
  }
  await connection.unsafe("SET default_transaction_read_only = off");
  let refreshed = 0;
  for (let index = 0; index < channelIds.length; index += BATCH_SIZE) {
    const batch = channelIds.slice(index, index + BATCH_SIZE);
    const metadata = await fetchYouTubeChannelMetadata(batch, youtubeApiKey);
    const records = [...metadata.values()].map((channel) => ({
      youtube_channel_id: channel.youtubeChannelId,
      name: channel.name,
      url: channel.url,
      thumbnail_url: channel.thumbnailUrl,
    }));
    if (records.length > 0) {
      await db.execute(sql`
        WITH incoming AS (
          SELECT * FROM jsonb_to_recordset(
            (${JSON.stringify(records)}::jsonb #>> '{}')::jsonb
          ) AS x(
            youtube_channel_id text,
            name text,
            url text,
            thumbnail_url text
          )
        )
        UPDATE yt_channels target
        SET
          name = COALESCE(incoming.name, target.name),
          url = incoming.url,
          thumbnail_url = incoming.thumbnail_url,
          metadata_fetched_at = NOW(),
          updated_at = NOW()
        FROM incoming
        WHERE target.youtube_channel_id = incoming.youtube_channel_id
      `);
      refreshed += records.length;
    }
    console.log(
      `${Math.min(index + BATCH_SIZE, channelIds.length)}/${channelIds.length}`,
    );
  }
  console.log(`Refreshed ${refreshed} channels.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => connection.end());
