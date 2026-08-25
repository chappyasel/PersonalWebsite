import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** @typedef {{ name: string, manifest: string, budget: number }} RouteBudget */
/** @typedef {{ path: string, gzipBytes: number }} ChunkBudget */
/** @typedef {{ budget: number, gzipBytes: number, passed: boolean, largestChunks: ChunkBudget[] }} RouteBudgetResult */

/** @type {RouteBudget[]} */
export const routes = [
  {
    name: "homepage",
    manifest: ".next/server/app/page_client-reference-manifest.js",
    // Re-baselined rather than quietly stepped over. main at 99be503 measured
    // 275.1 KB against the old 275 KB line, so the budget was already breached
    // before the boot work landed; that work then added 4.9 KB, all of it in
    // the entry chunk (51.0 to 55.1 KB gzip, every other chunk byte-identical).
    // The boot vignette ships in the initial entry deliberately, because it has
    // to paint before the lazy WebGL chunk exists, so there is no lazy boundary
    // to hide it behind.
    //
    // Nothing automated enforces this. `pnpm verify` excludes route budgets
    // because they need a fresh `.next`, and the quality-contracts workflow runs
    // only `pnpm verify`, so the sole place this fails is a local `pnpm build`.
    // That is why it drifted over the line unnoticed in the first place.
    // Field Notes adds semantic discovery tracking throughout the world. Its
    // 2,100-line development prototype and production album are lazy chunks;
    // the event reducer and call sites account for the measured increase from
    // 282.7 KB on main to 289.6 KB on this branch.
    budget: 292 * 1024,
  },
  {
    name: "books",
    manifest: ".next/server/app/books/page_client-reference-manifest.js",
    budget: 350 * 1024,
  },
];

/** @param {string} manifest */
export function extractChunkPaths(manifest) {
  return [
    ...new Set(
      [...manifest.matchAll(/static\/chunks\/[a-z0-9-]+\.js/g)].map(
        (match) => match[0],
      ),
    ),
  ];
}

/**
 * @param {{ manifest: string, budget: number, readChunk: (path: string) => Buffer | string }} options
 * @returns {RouteBudgetResult}
 */
export function measureRouteBudget({ manifest, budget, readChunk }) {
  const chunks = extractChunkPaths(manifest).map((path) => ({
    path,
    gzipBytes: gzipSync(readChunk(path)).byteLength,
  }));
  const gzipBytes = chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);

  return {
    budget,
    gzipBytes,
    passed: gzipBytes <= budget,
    largestChunks: [...chunks].sort(
      (a, b) => b.gzipBytes - a.gzipBytes || a.path.localeCompare(b.path),
    ),
  };
}

/**
 * @param {RouteBudget} route
 * @param {RouteBudgetResult} result
 */
export function formatRouteBudget(route, result) {
  const usedKb = (result.gzipBytes / 1024).toFixed(1);
  const budgetKb = (route.budget / 1024).toFixed(0);
  const lines = [`${route.name}: ${usedKb} KB gzip / ${budgetKb} KB`];

  if (!result.passed) {
    lines.push("  Largest gzip chunks:");
    for (const chunk of result.largestChunks.slice(0, 5)) {
      lines.push(
        `    ${(chunk.gzipBytes / 1024).toFixed(1)} KB  ${chunk.path}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * @param {readonly RouteBudget[]} configuredRoutes
 * @param {typeof readFileSync} readFile
 */
export function checkRouteBudgets(
  configuredRoutes = routes,
  readFile = readFileSync,
) {
  let failed = false;
  for (const route of configuredRoutes) {
    const manifest = readFile(route.manifest, "utf8");
    const result = measureRouteBudget({
      manifest,
      budget: route.budget,
      readChunk: (chunk) => readFile(`.next/${chunk}`),
    });

    console.log(formatRouteBudget(route, result));
    if (!result.passed) failed = true;
  }

  return !failed;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain && !checkRouteBudgets()) {
  process.exitCode = 1;
}
