#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} path */
function normalizeChunk(path) {
  return path.replace(/^\/?_next\//, "").replace(/^\//, "");
}

/**
 * @param {string} manifestSource
 * @returns {string[]}
 */
export function extractEntryChunks(manifestSource) {
  const assignmentLine = manifestSource
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.includes("globalThis.__RSC_MANIFEST["));
  if (!assignmentLine) throw new Error("Invalid client reference manifest");
  const assignment = assignmentLine.indexOf(" = ");
  if (assignment === -1) throw new Error("Invalid client reference manifest");
  const json = assignmentLine
    .slice(assignment + 3)
    .trim()
    .replace(/;$/, "");
  const manifest = JSON.parse(json);
  return [
    ...new Set(
      Object.values(manifest.entryJSFiles ?? {})
        .flat()
        .map(normalizeChunk),
    ),
  ];
}

/**
 * @param {{
 *   chunks: Map<string, string>;
 *   manifests: string[];
 *   publicSourceDigest: string;
 * }} input
 */
export function assertUniversalSearchBoundary({
  chunks,
  manifests,
  publicSourceDigest,
}) {
  const paletteChunks = [...chunks.entries()]
    .filter(
      ([, source]) =>
        source.includes("cmdk-root") &&
        source.includes("universal_search_opened"),
    )
    .map(([path]) => path);
  if (paletteChunks.length === 0) {
    throw new Error("Universal Search palette chunk was not found");
  }

  const initialChunks = new Set(manifests.flatMap(extractEntryChunks));
  const eagerPalette = paletteChunks.filter((path) => initialChunks.has(path));
  if (eagerPalette.length > 0) {
    throw new Error(
      `Universal Search palette entered an initial route chunk: ${eagerPalette.join(", ")}`,
    );
  }

  for (const path of initialChunks) {
    const source = chunks.get(path);
    if (source?.includes(publicSourceDigest)) {
      throw new Error(
        `Universal Search generated content entered an initial route chunk: ${path}`,
      );
    }
  }

  return { paletteChunks, initialChunkCount: initialChunks.size };
}

/** @param {string[]} files */
export function assertDadSearchTrace(files) {
  const privateIndexes = files.filter((path) =>
    path.endsWith("content/dad-search-index.json"),
  );
  if (privateIndexes.length !== 1) {
    throw new Error(
      "The private Dad index is absent from the /api/search file trace",
    );
  }
  return privateIndexes.length;
}

/**
 * @param {string} directory
 * @param {(path: string) => boolean} predicate
 * @returns {string[]}
 */
function findFiles(directory, predicate) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

/** @param {string} root */
function checkBuiltApp(root) {
  const nextRoot = join(root, ".next");
  const chunksRoot = join(nextRoot, "static", "chunks");
  const chunks = new Map(
    findFiles(chunksRoot, (path) => path.endsWith(".js")).map((path) => [
      normalizeChunk(relative(nextRoot, path)),
      readFileSync(path, "utf8"),
    ]),
  );
  const manifests = findFiles(join(nextRoot, "server", "app"), (path) =>
    path.endsWith("page_client-reference-manifest.js"),
  ).map((path) => readFileSync(path, "utf8"));
  const publicIndex = JSON.parse(
    readFileSync(
      join(root, "public", "data", "universal-search-index.json"),
      "utf8",
    ),
  );
  const boundary = assertUniversalSearchBoundary({
    chunks,
    manifests,
    publicSourceDigest: publicIndex.sourceDigest,
  });
  const searchTrace = JSON.parse(
    readFileSync(
      join(nextRoot, "server", "app", "api", "search", "route.js.nft.json"),
      "utf8",
    ),
  );
  return {
    ...boundary,
    dadIndexCount: assertDadSearchTrace(searchTrace.files ?? []),
  };
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  try {
    const result = checkBuiltApp(root);
    console.log(
      `Universal Search lazy boundary is intact (${result.paletteChunks.length} palette chunk, ${result.initialChunkCount} initial chunks, ${result.dadIndexCount} private Dad index traced).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
