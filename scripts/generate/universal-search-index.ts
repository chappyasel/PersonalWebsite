#!/usr/bin/env tsx
import {
  assertPublicSearchIndexArtifactFresh,
  writePublicSearchIndexArtifact,
} from "../../src/lib/universal-search/public-index-artifact";
import process from "node:process";

const check = process.argv.includes("--check");

try {
  if (check) {
    await assertPublicSearchIndexArtifactFresh(process.cwd());
    console.log("Universal search index is fresh.");
  } else {
    await writePublicSearchIndexArtifact(process.cwd());
    console.log("Wrote public/data/universal-search-index.json.");
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Search index failed.",
  );
  process.exitCode = 1;
}
