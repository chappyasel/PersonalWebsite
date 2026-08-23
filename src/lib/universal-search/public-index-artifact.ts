import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type PublicIndexSourceTexts,
  createPublicSearchIndex,
} from "./public-index-generation";

export const PUBLIC_SEARCH_INDEX_FILENAME =
  "universal-search-index.json" as const;

const SOURCE_FILES = {
  manual: "manual.json",
  routine: "routine.json",
  blog: "blog-posts.json",
  projects: "projects.json",
} as const;

function dataPath(rootDir: string, filename: string) {
  return join(rootDir, "public", "data", filename);
}

async function readSources(rootDir: string): Promise<PublicIndexSourceTexts> {
  const entries = await Promise.all(
    Object.entries(SOURCE_FILES).map(async ([name, filename]) => [
      name,
      await readFile(dataPath(rootDir, filename), "utf8"),
    ]),
  );
  return Object.fromEntries(entries) as PublicIndexSourceTexts;
}

export async function buildPublicSearchIndexArtifact(rootDir: string) {
  const index = createPublicSearchIndex(await readSources(rootDir));
  return `${JSON.stringify(index)}\n`;
}

export async function writePublicSearchIndexArtifact(rootDir: string) {
  const artifact = await buildPublicSearchIndexArtifact(rootDir);
  await writeFile(
    dataPath(rootDir, PUBLIC_SEARCH_INDEX_FILENAME),
    artifact,
    "utf8",
  );
}

export async function assertPublicSearchIndexArtifactFresh(rootDir: string) {
  const expected = await buildPublicSearchIndexArtifact(rootDir);
  let current: string;
  try {
    current = await readFile(
      dataPath(rootDir, PUBLIC_SEARCH_INDEX_FILENAME),
      "utf8",
    );
  } catch {
    throw new Error(
      "The universal search index is missing. Run `pnpm generate:search-index`.",
    );
  }
  if (current !== expected) {
    throw new Error(
      "The universal search index is stale. Run `pnpm generate:search-index`.",
    );
  }
}
