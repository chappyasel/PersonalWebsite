import * as fs from "fs";

/**
 * Sidecar the Takeout download writes next to `watch-history.json`, so the
 * sync knows which archive it is reading and when Google built it.
 *
 * The build time matters more than it looks: the archive is a snapshot of the
 * whole history as of that instant, so it is the boundary between "watched
 * nothing" and "not exported yet". Without it, a week of not opening YouTube
 * is indistinguishable from a week of missing data.
 */
export type TakeoutSidecar = {
  /** Absent when nothing could vouch for the build time. */
  exportCreatedAt?: string;
  sourceFile: string;
  driveFileId?: string;
  downloadedAt?: string;
};

/** `/…/watch-history.json` → `/…/watch-history.meta.json` */
export function sidecarPathFor(historyPath: string): string {
  return historyPath.replace(/(\.json)?$/, ".meta.json");
}

/** `takeout-20260830T231302Z-1-001.zip` → the instant Google built it. */
export function parseTakeoutTimestamp(name: string): Date | null {
  const match = /takeout-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(
    name,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const at = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`,
  );
  return Number.isNaN(at.getTime()) ? null : at;
}

export type ExportProvenance = {
  /** When Google built the archive, or null if nothing could vouch for it. */
  exportCreatedAt: Date | null;
  sourceFile: string | null;
};

/**
 * Establish when the archive at `historyPath` was built. The sidecar is the
 * only authority, and the archive name is a fallback for hand-placed files.
 * The file's own mtime cannot stand in. It records when the file was copied
 * out of the zip, which is after the build and often days after, so it would
 * count those unexported days as covered. With no build time the sync records
 * none, and Coverage Through falls back to the newest Watch Event.
 */
export function readExportProvenance(historyPath: string): ExportProvenance {
  const sidecarPath = sidecarPathFor(historyPath);
  if (fs.existsSync(sidecarPath)) {
    try {
      const sidecar = JSON.parse(
        fs.readFileSync(sidecarPath, "utf-8"),
      ) as Partial<TakeoutSidecar>;
      const at = sidecar.exportCreatedAt
        ? new Date(sidecar.exportCreatedAt)
        : null;
      if (at && !Number.isNaN(at.getTime())) {
        return { exportCreatedAt: at, sourceFile: sidecar.sourceFile ?? null };
      }
      const fromName = sidecar.sourceFile
        ? parseTakeoutTimestamp(sidecar.sourceFile)
        : null;
      if (fromName) {
        return {
          exportCreatedAt: fromName,
          sourceFile: sidecar.sourceFile ?? null,
        };
      }
    } catch {
      // A corrupt sidecar is not a reason to fail an ingest.
    }
  }

  return {
    exportCreatedAt: parseTakeoutTimestamp(historyPath),
    sourceFile: null,
  };
}
