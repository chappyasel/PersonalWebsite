import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * Route bundle gate, ratchet edition.
 *
 * The old shape was an absolute ceiling per route ("homepage <= 294 KB"),
 * re-baselined by hand each time a deliberate feature crossed it. It caught
 * real regressions — the boot vignette creep, a parallel-route slot's
 * always-loaded plumbing, a shared-chunk merge that dragged the fireworks
 * engine into the homepage graph — but its failure mode was wrong: with
 * sub-kilobyte headroom, bundler re-sharding noise turned into red deploys,
 * and it reddened PREVIEW deploys mid-iteration, which is the worst possible
 * time to be strict about 200 bytes.
 *
 * The gate now compares against the ACCEPTED baseline committed in
 * route-budgets.baseline.json:
 *
 * - growth within GROWTH_TOLERANCE of the baseline passes (and accumulates —
 *   the tolerance is measured from the baseline, not the previous build, so
 *   silent creep is capped at one tolerance until somebody accepts);
 * - growth beyond it fails, with the largest chunks listed. If the growth is
 *   deliberate, `pnpm budgets:accept` moves the baseline and the diff shows
 *   up in review where it can be argued with;
 * - preview deploys (VERCEL_ENV=preview) always report and never fail —
 *   production and local builds enforce;
 * - a build that comes in leaner prints a hint to accept the win, so the
 *   ratchet also tightens downward on purpose rather than by accident.
 *
 * Still true: `pnpm verify` excludes this (it needs a fresh `.next`), so the
 * only places it runs are a local `pnpm build` and Vercel's postbuild.
 * The boot vignette ships in the homepage entry deliberately — it has to
 * paint before the lazy WebGL chunk exists, so there is no lazy boundary to
 * hide it behind.
 */

/** @typedef {{ name: string, manifest: string }} BudgetRoute */
/** @typedef {{ path: string, gzipBytes: number }} ChunkBudget */
/** @typedef {{ budget: number, gzipBytes: number, passed: boolean, largestChunks: ChunkBudget[] }} RouteBudgetResult */

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = resolve(
  SCRIPT_DIR,
  "route-budgets.baseline.json",
);

/** Growth allowed over the accepted baseline (~1% of the homepage) before
 * the gate fails: room for chunk-sharding noise, far under any real leak. */
export const GROWTH_TOLERANCE = 3 * 1024;

/** @type {BudgetRoute[]} */
export const routes = [
  {
    name: "homepage",
    manifest: ".next/server/app/page_client-reference-manifest.js",
  },
  {
    name: "books",
    manifest: ".next/server/app/books/page_client-reference-manifest.js",
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
 * @param {{ name: string }} route
 * @param {RouteBudgetResult} result
 * @param {number} [baseline]
 */
export function formatRouteBudget(route, result, baseline) {
  const usedKb = (result.gzipBytes / 1024).toFixed(1);
  const lines = [];
  if (baseline === undefined) {
    lines.push(`${route.name}: ${usedKb} KB gzip`);
  } else {
    const delta = result.gzipBytes - baseline;
    const sign = delta >= 0 ? "+" : "-";
    lines.push(
      `${route.name}: ${usedKb} KB gzip (baseline ${(baseline / 1024).toFixed(1)} KB, ${sign}${(Math.abs(delta) / 1024).toFixed(1)} KB, tolerance ${(GROWTH_TOLERANCE / 1024).toFixed(0)} KB)`,
    );
  }

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
 * @param {{ accept?: boolean, readFile?: typeof readFileSync, writeFile?: typeof writeFileSync, env?: Record<string, string | undefined> }} [options]
 */
export function checkRouteBudgets({
  accept = false,
  readFile = readFileSync,
  writeFile = writeFileSync,
  env = process.env,
} = {}) {
  /** @type {Record<string, number>} */
  let baselines = {};
  try {
    baselines = JSON.parse(readFile(BASELINE_PATH, "utf8"));
  } catch {
    // First run (or a deleted baseline): every route reports "no baseline"
    // and only `--accept` can go green.
  }
  /** @type {Record<string, number>} */
  const measured = {};
  let failed = false;

  for (const route of routes) {
    const baseline = baselines[route.name];
    const manifest = readFile(route.manifest, "utf8");
    const result = measureRouteBudget({
      manifest,
      budget: baseline === undefined ? 0 : baseline + GROWTH_TOLERANCE,
      readChunk: (chunk) => readFile(`.next/${chunk}`),
    });
    measured[route.name] = result.gzipBytes;

    if (baseline === undefined) {
      console.log(
        `${route.name}: ${(result.gzipBytes / 1024).toFixed(1)} KB gzip — no baseline; run pnpm budgets:accept`,
      );
      failed = true;
      continue;
    }
    console.log(formatRouteBudget(route, result, baseline));
    if (!result.passed) {
      failed = true;
      console.log(
        "  Deliberate growth? Review it, then: pnpm budgets:accept",
      );
    } else if (result.gzipBytes < baseline - 1024) {
      console.log(
        "  Leaner than the baseline — pnpm budgets:accept locks the win in.",
      );
    }
  }

  if (accept) {
    writeFile(BASELINE_PATH, `${JSON.stringify(measured, null, 2)}\n`);
    console.log(`Baseline accepted -> ${BASELINE_PATH}`);
    return true;
  }
  if (failed && env.VERCEL_ENV === "preview") {
    console.log(
      "Over tolerance, but this is a PREVIEW deploy: reporting only. " +
        "Production and local builds enforce.",
    );
    return true;
  }
  return !failed;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const accept = process.argv.includes("--accept");
  if (!checkRouteBudgets({ accept })) {
    process.exitCode = 1;
  }
}
