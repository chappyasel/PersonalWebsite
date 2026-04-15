/**
 * One-off script to sync YouTube watch history from Google Takeout export.
 *
 * Run with: npx tsx scripts/sync-youtube.ts
 */

import "dotenv/config";
import { syncYouTube } from "../src/lib/youtube/sync";

const FILE_PATH =
  "/Users/chappyasel/Desktop/Takeout/YouTube and YouTube Music/history/watch-history.json";

async function main() {
  console.log("Starting YouTube sync...");
  const result = await syncYouTube("manual", FILE_PATH);
  console.log("Sync complete:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
