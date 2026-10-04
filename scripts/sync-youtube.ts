/**
 * One-off script to sync YouTube watch history from Google Takeout export.
 *
 * Run with: npx tsx scripts/sync-youtube.ts
 */
import "dotenv/config";
import * as os from "os";
import * as path from "path";

const FILE_PATH = path.join(
  os.homedir(),
  ".local/share/youtube-takeout/watch-history.json",
);

async function main() {
  // Load DB/env modules only after dotenv/config has initialized this CLI.
  const { syncYouTube } = await import("../src/lib/youtube/sync");
  console.log("Starting YouTube sync...");
  const result = await syncYouTube("manual", FILE_PATH);
  if ("status" in result && result.status !== "success") {
    throw new Error("YouTube sync did not report success");
  }
  console.log(
    JSON.stringify({
      event: "youtube_sync_complete",
      status: "success",
      ...result,
    }),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
