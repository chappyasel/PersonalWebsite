#!/usr/bin/env tsx
// Writes public/data/github.json, the committed snapshot of Chappy's GitHub
// activity that the Projects placard falls back to when GITHUB_TOKEN is
// absent or the live request fails. Uses GITHUB_TOKEN when set, otherwise
// the gh CLI's login. The snapshot is a fallback, not a build artifact, so
// nothing checks its freshness; rerun this whenever it looks stale.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { fetchGitHubActivity } from "../../src/lib/github/fetch";
import { GITHUB_LOGIN } from "../../src/lib/github/types";

const OUTPUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../public/data/github.json",
);

function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      "No GitHub token. Set GITHUB_TOKEN or sign in with `gh auth login`.",
    );
  }
}

try {
  const activity = await fetchGitHubActivity({
    token: resolveToken(),
    login: GITHUB_LOGIN,
  });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(activity, null, 2)}\n`);
  console.log(
    `Wrote public/data/github.json: ${activity.contributions.total} contributions, ${activity.repos.length} public repos, ${activity.activeRepos.length} active.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
