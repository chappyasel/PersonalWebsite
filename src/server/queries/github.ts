import { unstable_cache } from "next/cache";
import snapshot from "public/data/github.json";
import "server-only";

import { fetchGitHubActivity } from "~/lib/github/fetch";
import {
  GITHUB_LOGIN,
  type GitHubActivity,
  gitHubActivitySchema,
} from "~/lib/github/types";

import { env } from "~/env";

export const GITHUB_TAG = "github";
/** The homepage itself revalidates daily, so a shorter TTL buys nothing. */
export const GITHUB_REVALIDATE = 60 * 60 * 24;

const getLiveGitHubActivity = unstable_cache(
  async () =>
    fetchGitHubActivity({ token: env.GITHUB_TOKEN!, login: GITHUB_LOGIN }),
  ["github-activity"],
  { revalidate: GITHUB_REVALIDATE, tags: [GITHUB_TAG] },
);

/** The committed fallback, validated on first use rather than at import so a
 * bad file degrades the placard instead of failing the whole route module. */
export function gitHubSnapshot(): GitHubActivity {
  return gitHubActivitySchema.parse(snapshot);
}

/**
 * Live activity when a token is configured, the committed snapshot otherwise.
 * A failed live request also lands on the snapshot: stale numbers beat an
 * empty card, and the failure is logged so it does not pass for the answer.
 * Throws only when the snapshot itself is unreadable; the page degrades that
 * with `orEmpty`.
 */
export async function getGitHubActivity(): Promise<GitHubActivity> {
  if (!env.GITHUB_TOKEN) return gitHubSnapshot();
  try {
    return await getLiveGitHubActivity();
  } catch (error) {
    console.error("[home:github] live fetch failed, using snapshot:", error);
    return gitHubSnapshot();
  }
}
