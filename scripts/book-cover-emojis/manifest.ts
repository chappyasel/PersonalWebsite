/**
 * The manifest is the contract this generator hands to whatever uploads next.
 *
 * It answers three questions without anyone re-reading the database:
 *   - what did every source row become? (one entry per row, every row)
 *   - which Notion pages does each asset stand for? (the reread mapping)
 *   - what is still missing, and why? (missing cover vs. failed download)
 *
 * It is also the resume state. A second run reads the previous manifest,
 * keeps every asset whose cover URL is unchanged and whose file on disk still
 * hashes to the recorded digest, and refetches only the rest.
 */
import type { CoverGroup } from "./grouping";

export const MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_FILENAME = "manifest.json";

/** Why a group produced no asset. */
export type FailureKind = "missing-cover" | "fetch-failed" | "render-failed";

export type AssetEntry = {
  name: string;
  /** Path relative to the output directory, or null when nothing was written. */
  file: string | null;
  status: "success" | FailureKind;
  title: string;
  author: string;
  publicationYear: number | null;
  coverUrl: string | null;
  /** books.id of the row whose cover was used. */
  coverRowId: string | null;
  coverColor: string | null;
  /** Every reading that folds into this asset. */
  sourceRowIds: string[];
  notionIds: string[];
  readings: number;
  /** Present only on success. */
  png?: {
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    /** Opaque art inside the transparent square. */
    art: { width: number; height: number; left: number; top: number };
    source: { width: number; height: number; format: string };
  };
  error?: string;
};

export type RowEntry = {
  bookId: string;
  notionId: string;
  title: string;
  author: string;
  finished: string | null;
  abandoned: string | null;
  /** The asset this row maps onto, whether or not it rendered. */
  asset: string;
  status: "success" | FailureKind;
  /** True when another row in the same group shares this asset. */
  reread: boolean;
};

export type Manifest = {
  schemaVersion: number;
  generatedAt: string;
  generator: string;
  /**
   * True only when this manifest covers every book in the source catalog and
   * the run reached the end. False for a checkpoint written mid-batch and
   * false for a --limit subset, which covers a slice by construction. Every
   * asset listed is finished and resumable either way.
   */
  complete: boolean;
  /** Set when --limit was used, so a partial catalog cannot pass for a full one. */
  subset: { limit: number; of: number } | null;
  source: {
    description: string;
    table: string;
    /** Every row the read-only query returned. */
    rows: number;
    /** One per distinct title+author. */
    groups: number;
    coverageCaveat: string;
  };
  emoji: {
    size: number;
    format: string;
    channels: number;
    fit: string;
    background: string;
  };
  counts: {
    rows: Record<RowEntry["status"], number> & { total: number };
    assets: Record<AssetEntry["status"], number> & { total: number };
    rereadGroups: number;
  };
  assets: AssetEntry[];
  rows: RowEntry[];
};

export const COVERAGE_CAVEAT =
  "Source is the Postgres mirror of the Notion Book Notes database, which " +
  "admits a page only once its Started or Finished date is set " +
  "(src/lib/books/notion.ts). Undated Notion-only pages — blank skeletons and " +
  "want-to-read entries — are therefore outside this catalog entirely, not " +
  "counted as missing below. The mirror also refreshes on a daily 09:00 UTC " +
  "cron, so a jacket swapped in Notion today can still be yesterday's here.";

/** One asset per group, one row entry per source row. */
export function buildRowEntries(
  groups: readonly CoverGroup[],
  statusByName: ReadonlyMap<string, AssetEntry["status"]>,
): RowEntry[] {
  const entries: RowEntry[] = [];
  for (const group of groups) {
    const status = statusByName.get(group.name) ?? "render-failed";
    for (const row of group.rows) {
      entries.push({
        bookId: row.id,
        notionId: row.notionId,
        title: row.title,
        author: row.author,
        finished: row.finished,
        abandoned: row.abandoned,
        asset: group.name,
        status,
        reread: group.rows.length > 1,
      });
    }
  }
  return entries.sort(
    (a, b) => a.asset.localeCompare(b.asset) || a.notionId.localeCompare(b.notionId),
  );
}

export function countManifest(
  assets: readonly AssetEntry[],
  rows: readonly RowEntry[],
): Manifest["counts"] {
  const blank = {
    success: 0,
    "missing-cover": 0,
    "fetch-failed": 0,
    "render-failed": 0,
  };
  const assetCounts = { ...blank, total: assets.length };
  for (const asset of assets) assetCounts[asset.status] += 1;
  const rowCounts = { ...blank, total: rows.length };
  for (const row of rows) rowCounts[row.status] += 1;
  return {
    rows: rowCounts,
    assets: assetCounts,
    rereadGroups: assets.filter((asset) => asset.readings > 1).length,
  };
}

export type PlanAction = "reuse" | "render" | "skip-no-cover";

export type PlanItem = {
  group: CoverGroup;
  action: PlanAction;
  /** The manifest entry to carry forward untouched when reusing. */
  reuse?: AssetEntry;
};

/**
 * Decide what the run has to do. Pure so the resume rules can be tested
 * without a filesystem: a caller supplies the previous manifest's assets and
 * the digest of whatever is on disk under each name.
 */
export function planWork(
  groups: readonly CoverGroup[],
  previous: ReadonlyMap<string, AssetEntry>,
  digestOnDisk: (name: string) => string | null,
  force = false,
): PlanItem[] {
  return groups.map((group) => {
    if (!group.coverUrl) return { group, action: "skip-no-cover" as const };
    if (force) return { group, action: "render" as const };
    const prior = previous.get(group.name);
    if (
      prior?.status === "success" &&
      prior.png &&
      prior.coverUrl === group.coverUrl &&
      digestOnDisk(group.name) === prior.png.sha256
    ) {
      // Same jacket, same bytes on disk: nothing to refetch. Row entries are
      // still rebuilt from the live catalog, so a new reread is picked up.
      return { group, action: "reuse" as const, reuse: prior };
    }
    return { group, action: "render" as const };
  });
}

/**
 * Carry a previous run's rendered PNG forward onto the current catalog.
 *
 * The image is what is expensive, so it is kept; every other field is source
 * metadata that may have moved since it was written. Refreshing only the ids
 * left coverRowId, publicationYear, and coverColor describing a catalog that
 * no longer exists — a manifest that disagreed with the database it claimed
 * to mirror. The cover URL is already known to match, since an unchanged URL
 * is what qualified the asset for reuse in the first place.
 */
export function refreshReusedAsset(
  prior: AssetEntry,
  group: CoverGroup,
): AssetEntry {
  return {
    ...prior,
    title: group.title,
    author: group.author,
    publicationYear: group.publicationYear,
    coverUrl: group.coverUrl,
    coverRowId: group.coverRowId,
    coverColor: group.coverColor,
    sourceRowIds: group.rows.map((row) => row.id),
    notionIds: group.rows.map((row) => row.notionId),
    readings: group.rows.length,
  };
}

export function assetIndex(
  manifest: Manifest | null,
): Map<string, AssetEntry> {
  const index = new Map<string, AssetEntry>();
  for (const asset of manifest?.assets ?? []) index.set(asset.name, asset);
  return index;
}
