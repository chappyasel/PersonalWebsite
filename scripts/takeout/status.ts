/**
 * One read-only answer to "is the YouTube pipeline actually current?".
 *
 * The thing this exists to stop: `no_new_archive` reading as success. That
 * event means the Drive check ran and found nothing newer, which is a statement
 * about the importer's health, not about the corpus. On the day this was
 * written the importer had ingested at 00:07 and reported no new archive, while
 * the newest archive Google had built was six days old — a healthy check over a
 * stale corpus, and nothing in the output said so.
 *
 * So two numbers are kept apart and both are reported:
 *
 *   last_ingested_at   when the importer last succeeded (a process fact)
 *   coverage_through   the archive's own build time (how complete the data is)
 *
 * Freshness is computed from the second one only. Anything that cannot be
 * established is `missing` or `unknown`, never `fresh`, and every failure is
 * named in a closed vocabulary so a relay can forward it without passing along
 * whatever a child process happened to print.
 */
import type {
  RequestBlocker,
  RequestFailure,
  RequestPhase,
  RequestStateRead,
} from "./request-state";
import type { RefreshState } from "./state";

export const FRESHNESS_MAX_AGE_HOURS_ENV =
  "YOUTUBE_TAKEOUT_FRESHNESS_MAX_AGE_HOURS";
/**
 * One request cycle (the importer asks for an export after 5 days) plus a day
 * for Google to build and deliver it. Past this, coverage is behind.
 */
export const DEFAULT_FRESHNESS_MAX_AGE_HOURS = 144;
/**
 * How long a queue observation is worth repeating. Past this, "an export was
 * pending" is history, not a statement about Google's queue right now.
 */
export const PENDING_OBSERVATION_MAX_AGE_HOURS = 24;

export type FreshnessVerdict = "fresh" | "stale" | "missing" | "unknown";
export type DriveCheck = "healthy" | "failing" | "unknown";

export type RequestStatusCode =
  | RequestPhase
  | "request_state_missing"
  | "request_state_unreadable"
  | "unknown";

export type StatusFailure =
  | "corpus_stale"
  | "coverage_missing"
  | "coverage_unknown"
  | "drive_check_failing"
  | "drive_check_unknown"
  | "importer_state_missing"
  | "enrichment_pending"
  | "drive_auth_failed"
  | "download_failed"
  | "sync_failed"
  | "classify_failed"
  | "score_failed"
  | "google_auth_expired"
  | "passkey_step_up"
  | "request_stuck_gave_up"
  | "importer_error_other"
  | "request_state_missing"
  | "request_state_unreadable"
  | "request_state_foreign_host"
  | "request_blocked"
  | "request_failed";

export type E2eStatus = {
  schema: 1;
  generated_at: string;
  /** Whether the importer's Drive check itself is working. Not freshness. */
  drive_check: DriveCheck;
  last_ingested_at: string | null;
  ingest_age_hours: number | null;
  /** The archive build time the corpus is complete to. */
  coverage_through: string | null;
  coverage_age_hours: number | null;
  coverage_source_file: string | null;
  freshness: FreshnessVerdict;
  freshness_max_age_hours: number;
  request_status: RequestStatusCode;
  request_blocker: RequestBlocker | null;
  request_detail: RequestFailure | null;
  /**
   * What the last queue observation found, named as history because that is
   * what it is. `unknown` once the observation is older than
   * PENDING_OBSERVATION_MAX_AGE_HOURS, or when none was ever made.
   */
  last_observed_pending_export: "yes" | "no" | "unknown";
  /** When that observation was made, so the answer above can be judged. */
  request_observed_at: string | null;
  request_state_host: string | null;
  failures: StatusFailure[];
};

export function freshnessMaxAgeHours(
  env: Record<string, string | undefined>,
): number {
  const raw = env[FRESHNESS_MAX_AGE_HOURS_ENV];
  if (raw === undefined) return DEFAULT_FRESHNESS_MAX_AGE_HOURS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_FRESHNESS_MAX_AGE_HOURS;
  }
  return value;
}

const IMPORTER_ERROR_CODES: [RegExp, StatusFailure][] = [
  [/^drive_auth_failed$/, "drive_auth_failed"],
  [/^download_failed(_\d+)?$/, "download_failed"],
  [/^sync_failed$/, "sync_failed"],
  [/^classify_failed$/, "classify_failed"],
  [/^score_failed$/, "score_failed"],
  [/^google_auth_expired$/, "google_auth_expired"],
  [/^passkey_step_up$/, "passkey_step_up"],
  [/^request_stuck_gave_up$/, "request_stuck_gave_up"],
];

/** Map the importer's own error text onto the closed vocabulary. */
function importerFailures(error: string | null | undefined): StatusFailure[] {
  if (!error) return [];
  return error.split(",").map((part) => {
    const trimmed = part.trim();
    const match = IMPORTER_ERROR_CODES.find(([pattern]) => pattern.test(trimmed));
    return match ? match[1] : "importer_error_other";
  });
}

/**
 * Age in hours, or null when the instant cannot be used. A timestamp in the
 * future is not usable: it would produce a negative age, and a negative age is
 * under every threshold, so a clock skew or a hand-edited file would read as
 * the freshest possible data.
 */
function ageHours(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const hours = (now.getTime() - at) / 3_600_000;
  return hours < 0 ? null : hours;
}

export function computeE2eStatus(input: {
  now: Date;
  importer: RefreshState | null;
  request: RequestStateRead;
  driveCheck: DriveCheck;
  hostname: string;
  maxAgeHours: number;
}): E2eStatus {
  const { now, importer, request, driveCheck, hostname, maxAgeHours } = input;
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    throw new Error("invalid_freshness_max_age");
  }
  const failures: StatusFailure[] = [];

  if (driveCheck === "failing") failures.push("drive_check_failing");
  if (driveCheck === "unknown") failures.push("drive_check_unknown");
  if (!importer) failures.push("importer_state_missing");
  if (importer?.enrichment_pending) failures.push("enrichment_pending");
  failures.push(...importerFailures(importer?.last_error));

  const archive = importer?.last_ingested_archive;
  const coverageThrough = archive?.exportCreatedAt ?? null;
  const coverageAge = ageHours(coverageThrough, now);

  let freshness: FreshnessVerdict;
  if (!coverageThrough) {
    freshness = "missing";
    failures.push("coverage_missing");
  } else if (coverageAge === null) {
    freshness = "unknown";
    failures.push("coverage_unknown");
  } else if (coverageAge > maxAgeHours) {
    freshness = "stale";
    failures.push("corpus_stale");
  } else {
    freshness = "fresh";
  }

  let requestStatus: RequestStatusCode;
  let blocker: RequestBlocker | null = null;
  let detail: RequestFailure | null = null;
  let pendingExport: E2eStatus["last_observed_pending_export"] = "unknown";
  let observedAt: string | null = null;
  let requestHost: string | null = null;

  if (!request.present) {
    requestStatus = "request_state_missing";
    failures.push("request_state_missing");
  } else if (!request.state) {
    requestStatus = "request_state_unreadable";
    failures.push("request_state_unreadable");
  } else if (request.state.host !== hostname) {
    // Another machine's record cannot be verified from here, so it is reported
    // as unknown rather than as whatever it claims.
    requestStatus = "unknown";
    requestHost = request.state.host;
    failures.push("request_state_foreign_host");
  } else {
    requestStatus = request.state.phase;
    blocker = request.state.blocker;
    detail = request.state.last_error;
    requestHost = request.state.host;
    const observation = request.state.last_queue_observation;
    observedAt = observation?.observedAt ?? null;
    const observationAge = ageHours(observedAt, now);
    if (
      observation &&
      observationAge !== null &&
      observationAge <= PENDING_OBSERVATION_MAX_AGE_HOURS
    ) {
      pendingExport = observation.pendingYouTube ? "yes" : "no";
    }
    if (blocker) failures.push("request_blocked");
    if (request.state.phase === "failed") failures.push("request_failed");
  }

  return {
    schema: 1,
    generated_at: now.toISOString(),
    drive_check: driveCheck,
    last_ingested_at: importer?.last_ingested_at ?? null,
    ingest_age_hours: round(ageHours(importer?.last_ingested_at, now)),
    coverage_through: coverageThrough,
    coverage_age_hours: round(coverageAge),
    coverage_source_file: archive?.sourceFile ?? null,
    freshness,
    freshness_max_age_hours: maxAgeHours,
    request_status: requestStatus,
    request_blocker: blocker,
    request_detail: detail,
    last_observed_pending_export: pendingExport,
    request_observed_at: observedAt,
    request_state_host: requestHost,
    failures: [...new Set(failures)].sort(),
  };
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}
