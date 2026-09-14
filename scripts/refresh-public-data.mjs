#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PUBLIC_DATA_GENERATORS = [
  "scripts/generate/github-activity.ts",
  "scripts/generate/manual.ts",
  "scripts/generate/routine.ts",
  "scripts/generate/systems.ts",
  "scripts/generate/blog-posts.ts",
  "scripts/generate/aic-chapters.ts",
  // Search depends on the refreshed documents and post list.
  "scripts/generate/universal-search-index.ts",
];

/** Refresh only public snapshots. Publishing is a separate PR-only workflow. */
export function refreshPublicData({
  cwd = root,
  env = process.env,
  run = execFileSync,
} = {}) {
  for (const name of ["NOTION_API_KEY", "GITHUB_TOKEN"]) {
    if (!env[name]?.trim())
      throw new Error(`${name} is required for public data refresh`);
  }
  for (const script of PUBLIC_DATA_GENERATORS) {
    console.log(`Refreshing ${script}`);
    run(process.execPath, ["--import", "tsx", script], {
      cwd,
      env,
      stdio: "inherit",
      timeout: 15 * 60 * 1000,
    });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    refreshPublicData();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Public data refresh failed",
    );
    process.exitCode = 1;
  }
}
