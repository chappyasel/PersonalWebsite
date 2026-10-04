import {
  type TakeoutSidecar,
  sidecarPathFor,
} from "../../src/lib/youtube/coverage";
import * as fs from "fs";

import { takeoutPaths } from "./config";

export type RefreshState = {
  state: "idle" | "requested";
  requested_at: string | null;
  last_ingested_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  /** Advanced only after sync succeeds; downloadedAt is never coverage. */
  last_ingested_archive?: TakeoutSidecar;
  /** Retry enrichment without reingesting an already successful archive. */
  enrichment_pending?: boolean;
  /** Set when a headed approval window has been launched and is awaiting a tap.
   *  Suppresses re-launching a duplicate window on the next cron tick. */
  approval_pending_since?: string | null;
  /** Throttle for the staleness watchdog alert (at most once per window). */
  last_stale_alert_at?: string | null;
};

const DEFAULT_STATE: RefreshState = {
  state: "idle",
  requested_at: null,
  last_ingested_at: null,
  last_error: null,
  consecutive_failures: 0,
};

export function readState(): RefreshState {
  const { stateFile: STATE_FILE } = takeoutPaths();
  if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as RefreshState;
}

export function writeState(state: RefreshState): void {
  const { stateDir: STATE_DIR, stateFile: STATE_FILE } = takeoutPaths();
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

export function stateFilePath(): string {
  return takeoutPaths().stateFile;
}

export function readDownloadedArchive(): TakeoutSidecar | undefined {
  const file = sidecarPathFor(takeoutPaths().historyPath);
  if (!fs.existsSync(file)) return undefined;
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as TakeoutSidecar;
  if (
    !value.driveFileId ||
    !value.sourceFile ||
    !value.exportCreatedAt ||
    !Number.isFinite(Date.parse(value.exportCreatedAt))
  ) {
    throw new Error("invalid_archive_sidecar");
  }
  return value;
}

export function ingestedArchive(
  state: RefreshState,
): TakeoutSidecar | undefined {
  if (state.last_ingested_archive) return state.last_ingested_archive;
  // Migrate the old state only when the download preceded a successful ingest.
  // A sidecar from a failed/pending sync must never suppress a retry.
  try {
    const archive = readDownloadedArchive();
    if (
      archive?.downloadedAt &&
      state.last_ingested_at &&
      Date.parse(archive.downloadedAt) <= Date.parse(state.last_ingested_at)
    ) {
      return archive;
    }
  } catch {
    /* Missing or invalid legacy metadata means discover without a cutoff. */
  }
  return undefined;
}
