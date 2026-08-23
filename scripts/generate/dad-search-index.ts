#!/usr/bin/env tsx
import { writeDadSearchIndexArtifact } from "../../src/lib/universal-search/server/dad-index-artifact";

try {
  const count = await writeDadSearchIndexArtifact(process.cwd());
  console.log(`Wrote private Dad search index (${count} documents).`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Dad search index failed.",
  );
  process.exitCode = 1;
}
