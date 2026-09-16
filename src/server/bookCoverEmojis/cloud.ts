/**
 * The recurring path, entirely on Vercel.
 *
 * Everything this feature does at runtime happens here: read the mirrored
 * catalog, render the jackets that changed, upload them to Notion, and set the
 * page icons. There is no second service, no queue for another machine to
 * drain, and no local scheduler. The cron route calls this and nothing else.
 */
import { BOOK_WORKSPACE_ID } from "~/lib/bookCoverEmojis/pageGuard";
import { EmojiStore } from "~/lib/bookCoverEmojis/store";
import { runPipeline } from "~/lib/bookCoverEmojis/pipeline";

import { readCloudCatalog } from "./catalog";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/**
 * A variable that is present but blank is the normal shape of "not
 * configured", so it reads as absent rather than as an empty value. Without
 * this an unset variable in Vercel would reach the UUID check and fail the
 * cron every day.
 */
function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

export async function syncBookEmojis() {
  // Defaults to the known workspace so a deploy needs no new configuration.
  // The variable stays as an override, and the token is still checked against
  // whichever value wins before anything is read or written.
  const workspaceId =
    optional("BOOK_COVER_EMOJIS_WORKSPACE_ID") ?? BOOK_WORKSPACE_ID;
  if (!UUID.test(workspaceId)) throw new Error("Invalid workspace ID");
  const token = required("NOTION_API_KEY");
  const databaseUrl = required("DATABASE_URL");

  return runPipeline({
    store: new EmojiStore({
      bucket: required("AWS_BUCKET_NAME"),
      region: required("AWS_REGION"),
    }),
    notion: { token },
    workspaceId,
    readCatalog: () => readCloudCatalog(databaseUrl),
    apply: true,
    // The function is capped at 300s; leave room to finish the book in hand.
    budgetMs: 240_000,
    maxWorks: 20,
  });
}
