import * as os from "node:os";
import { describe, expect, it } from "vitest";

import type { RefreshState } from "./state";
import {
  DEFAULT_FRESHNESS_MAX_AGE_HOURS,
  FRESHNESS_MAX_AGE_HOURS_ENV,
  PENDING_OBSERVATION_MAX_AGE_HOURS,
  computeE2eStatus,
  freshnessMaxAgeHours,
} from "./status";
import { blankRequestState, recordQueued } from "./request-state";

/** The live production numbers this repair was reported against. */
const PRODUCTION = {
  now: new Date("2026-10-04T18:00:00.000Z"),
  lastIngestedAt: "2026-10-04T00:07:16.748Z",
  coverage: "2026-09-28T06:04:58.013Z",
  sourceFile: "takeout-20260928T055945Z-1-001.zip",
};

function importer(overrides: Partial<RefreshState> = {}): RefreshState {
  return {
    state: "idle",
    requested_at: null,
    last_ingested_at: PRODUCTION.lastIngestedAt,
    last_error: null,
    consecutive_failures: 0,
    last_ingested_archive: {
      driveFileId: "drive-1",
      sourceFile: PRODUCTION.sourceFile,
      exportCreatedAt: PRODUCTION.coverage,
      downloadedAt: "2026-09-28T07:00:00.000Z",
    },
    ...overrides,
  };
}

function status(
  input: Partial<Parameters<typeof computeE2eStatus>[0]> = {},
): ReturnType<typeof computeE2eStatus> {
  return computeE2eStatus({
    now: PRODUCTION.now,
    importer: importer(),
    request: { present: false, state: null },
    driveCheck: "healthy",
    hostname: os.hostname(),
    maxAgeHours: DEFAULT_FRESHNESS_MAX_AGE_HOURS,
    ...input,
  });
}

describe("a healthy Drive check is not a fresh corpus", () => {
  it("calls today's production state stale, with the Drive check still healthy", () => {
    const result = status();
    expect(result).toMatchObject({
      drive_check: "healthy",
      last_ingested_at: PRODUCTION.lastIngestedAt,
      coverage_through: PRODUCTION.coverage,
      coverage_source_file: PRODUCTION.sourceFile,
      freshness: "stale",
      freshness_max_age_hours: 144,
    });
    expect(result.ingest_age_hours).toBeCloseTo(17.9, 1);
    expect(result.coverage_age_hours).toBeCloseTo(155.9, 1);
    expect(result.failures).toContain("corpus_stale");
  });

  it("keeps the ingestion timestamp and the coverage instant apart", () => {
    const result = status();
    expect(result.last_ingested_at).not.toBe(result.coverage_through);
    // An ingest that ran hours ago from a week-old archive is the exact case
    // where one number flatters the other.
    expect(result.ingest_age_hours!).toBeLessThan(result.coverage_age_hours!);
  });

  it("calls a recent archive fresh without any failure", () => {
    const result = status({
      importer: importer({
        last_ingested_archive: {
          driveFileId: "drive-2",
          sourceFile: "takeout-20261003T055945Z-1-001.zip",
          exportCreatedAt: "2026-10-03T06:00:00.000Z",
          downloadedAt: "2026-10-04T00:00:00.000Z",
        },
      }),
    });
    expect(result.freshness).toBe("fresh");
    expect(result.failures).not.toContain("corpus_stale");
  });

  it("does not let a failing Drive check read as fresh or as stale-only", () => {
    const result = status({ driveCheck: "failing" });
    expect(result.drive_check).toBe("failing");
    expect(result.failures).toContain("drive_check_failing");
    expect(result.failures).toContain("corpus_stale");
  });

  it("reports an unknown Drive check as unknown, not as healthy", () => {
    expect(status({ driveCheck: "unknown" }).drive_check).toBe("unknown");
  });
});

describe("coverage that cannot be read", () => {
  it("reports missing coverage as missing, never as fresh", () => {
    const result = status({
      importer: importer({ last_ingested_archive: undefined }),
    });
    expect(result).toMatchObject({
      freshness: "missing",
      coverage_through: null,
      coverage_age_hours: null,
    });
    expect(result.failures).toContain("coverage_missing");
  });

  it("reports an archive with no build time as missing coverage", () => {
    const result = status({
      importer: importer({
        last_ingested_archive: { sourceFile: "hand-placed.zip" },
      }),
    });
    expect(result.freshness).toBe("missing");
  });

  it("reports an unparsable build time as unknown", () => {
    const result = status({
      importer: importer({
        last_ingested_archive: {
          sourceFile: PRODUCTION.sourceFile,
          exportCreatedAt: "last Tuesday",
        },
      }),
    });
    expect(result).toMatchObject({ freshness: "unknown", coverage_age_hours: null });
    expect(result.failures).toContain("coverage_unknown");
  });

  it("reports a missing importer record without inventing an ingestion", () => {
    const result = status({ importer: null });
    expect(result).toMatchObject({
      freshness: "missing",
      last_ingested_at: null,
      ingest_age_hours: null,
      coverage_through: null,
    });
    expect(result.failures).toContain("importer_state_missing");
  });
});

describe("request status", () => {
  it("says the request record is missing rather than idle", () => {
    const result = status({ request: { present: false, state: null } });
    expect(result).toMatchObject({
      request_status: "request_state_missing",
      request_blocker: null,
      last_observed_pending_export: "unknown",
      request_state_host: null,
    });
    expect(result.failures).toContain("request_state_missing");
  });

  it("says an unparsable request record is unreadable, not queued", () => {
    const result = status({
      request: { present: true, state: null, error: "unreadable" },
    });
    expect(result.request_status).toBe("request_state_unreadable");
    expect(result.failures).toContain("request_state_unreadable");
  });

  it("reports another host's record as unknown, with no claim about it", () => {
    const foreign = recordQueued(
      { ...blankRequestState(), host: "other-mac.local" },
      {
        now: PRODUCTION.now,
        evidence: {
          source: "takeout_manage_queue",
          exportId: "export-new",
          createdAtText: "Oct 4, 2026",
          observedAt: PRODUCTION.now.toISOString(),
        },
      },
    );
    const result = status({ request: { present: true, state: foreign } });
    expect(result).toMatchObject({
      request_status: "unknown",
      request_state_host: "other-mac.local",
      request_blocker: null,
      last_observed_pending_export: "unknown",
    });
    expect(result.failures).toContain("request_state_foreign_host");
  });

  it.each([
    ["awaiting_auth", "awaiting_auth"],
    ["submitted_unverified", "submitted_unverified"],
    ["queued", "queued"],
    ["failed", "failed"],
    ["idle", "idle"],
  ] as const)("surfaces the %s phase distinctly", (phase, expected) => {
    const result = status({
      request: {
        present: true,
        state: { ...blankRequestState(), phase },
      },
    });
    expect(result.request_status).toBe(expected);
  });

  it("surfaces a blocker and a failure without either hiding the other", () => {
    const result = status({
      request: {
        present: true,
        state: {
          ...blankRequestState(),
          phase: "failed",
          blocker: "credential_route_unavailable",
          last_error: "password_route_failed",
          consecutive_failures: 2,
        },
      },
    });
    expect(result).toMatchObject({
      request_status: "failed",
      request_blocker: "credential_route_unavailable",
      request_detail: "password_route_failed",
    });
    expect(result.failures).toEqual(
      expect.arrayContaining(["request_blocked", "request_failed"]),
    );
  });

  it("reports an observed pending export, and says unknown when none was seen", () => {
    const observed = {
      ...blankRequestState(),
      last_queue_observation: {
        observedAt: PRODUCTION.now.toISOString(),
        pendingYouTube: true,
        exportIds: ["export-old"],
      },
    };
    expect(
      status({ request: { present: true, state: observed } }).request_observed_at,
    ).toBe(PRODUCTION.now.toISOString());
    expect(
      status({ request: { present: true, state: observed } }).last_observed_pending_export,
    ).toBe("yes");
    expect(
      status({
        request: {
          present: true,
          state: {
            ...observed,
            last_queue_observation: {
              observedAt: PRODUCTION.now.toISOString(),
              pendingYouTube: false,
              exportIds: [],
            },
          },
        },
      }).last_observed_pending_export,
    ).toBe("no");
    expect(
      status({ request: { present: true, state: blankRequestState() } })
        .last_observed_pending_export,
    ).toBe("unknown");
  });
});

describe("an observation is only as good as its age", () => {
  function observedHoursAgo(hours: number) {
    return {
      ...blankRequestState(),
      last_queue_observation: {
        observedAt: new Date(
          PRODUCTION.now.getTime() - hours * 3_600_000,
        ).toISOString(),
        pendingYouTube: true,
        exportIds: ["export-old"],
      },
    };
  }

  it("stops repeating a stale observation as the current answer", () => {
    const recent = status({
      request: { present: true, state: observedHoursAgo(1) },
    });
    expect(recent.last_observed_pending_export).toBe("yes");

    const old = status({
      request: {
        present: true,
        state: observedHoursAgo(PENDING_OBSERVATION_MAX_AGE_HOURS + 1),
      },
    });
    expect(old.last_observed_pending_export).toBe("unknown");
    // The timestamp is still reported, so the reader can see why.
    expect(old.request_observed_at).not.toBeNull();
  });

  it("ignores an observation dated in the future", () => {
    const result = status({
      request: { present: true, state: observedHoursAgo(-5) },
    });
    expect(result.last_observed_pending_export).toBe("unknown");
  });
});

describe("dates that cannot be trusted", () => {
  it("calls a coverage date in the future unknown, never fresh", () => {
    const result = status({
      importer: importer({
        last_ingested_archive: {
          driveFileId: "drive-9",
          sourceFile: "takeout-20261130T055945Z-1-001.zip",
          exportCreatedAt: "2026-11-30T06:00:00.000Z",
        },
      }),
    });
    expect(result).toMatchObject({
      freshness: "unknown",
      coverage_age_hours: null,
      coverage_through: "2026-11-30T06:00:00.000Z",
    });
    expect(result.failures).toContain("coverage_unknown");
    expect(result.failures).not.toContain("corpus_stale");
  });

  it("reports an ingestion time in the future as no age at all", () => {
    const result = status({
      importer: importer({ last_ingested_at: "2026-12-01T00:00:00.000Z" }),
    });
    expect(result.ingest_age_hours).toBeNull();
    expect(result.last_ingested_at).toBe("2026-12-01T00:00:00.000Z");
  });

  it("refuses to compute anything against a nonsense freshness window", () => {
    for (const maxAgeHours of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => status({ maxAgeHours })).toThrow("invalid_freshness_max_age");
    }
  });
});

describe("importer failures stay surfaced", () => {
  it.each([
    ["drive_auth_failed", "drive_auth_failed"],
    ["sync_failed", "sync_failed"],
    ["classify_failed,score_failed", "classify_failed"],
    ["download_failed_2", "download_failed"],
    ["google_auth_expired", "google_auth_expired"],
    ["request_stuck_gave_up", "request_stuck_gave_up"],
    ["something nobody enumerated", "importer_error_other"],
  ])("maps the importer error %s into the closed vocabulary", (error, expected) => {
    const result = status({ importer: importer({ last_error: error }) });
    expect(result.failures).toContain(expected);
  });

  it("maps both halves of a combined enrichment failure", () => {
    const result = status({
      importer: importer({ last_error: "classify_failed,score_failed" }),
    });
    expect(result.failures).toEqual(
      expect.arrayContaining(["classify_failed", "score_failed"]),
    );
  });

  it("surfaces pending enrichment", () => {
    expect(
      status({ importer: importer({ enrichment_pending: true }) }).failures,
    ).toContain("enrichment_pending");
  });

  it("returns a sorted, de-duplicated failure list", () => {
    const result = status({
      importer: importer({ last_error: "sync_failed,sync_failed" }),
      driveCheck: "failing",
    });
    expect(result.failures).toEqual([...new Set(result.failures)].sort());
  });

  it("leaves the list empty when everything is genuinely well", () => {
    const result = status({
      importer: importer({
        last_ingested_archive: {
          driveFileId: "drive-2",
          sourceFile: "takeout-20261003T055945Z-1-001.zip",
          exportCreatedAt: "2026-10-03T06:00:00.000Z",
        },
      }),
      request: { present: true, state: blankRequestState() },
    });
    expect(result.failures).toEqual([]);
  });
});

describe("freshnessMaxAgeHours", () => {
  it("defaults to one request cycle plus a day of delivery slack", () => {
    expect(DEFAULT_FRESHNESS_MAX_AGE_HOURS).toBe(144);
    expect(freshnessMaxAgeHours({})).toBe(144);
  });

  it("takes a positive finite override", () => {
    expect(freshnessMaxAgeHours({ [FRESHNESS_MAX_AGE_HOURS_ENV]: "48" })).toBe(48);
    expect(freshnessMaxAgeHours({ [FRESHNESS_MAX_AGE_HOURS_ENV]: "0.5" })).toBe(0.5);
  });

  it("ignores an override that is not a positive number", () => {
    for (const value of ["", "0", "-5", "soon", "NaN", "Infinity"]) {
      expect(freshnessMaxAgeHours({ [FRESHNESS_MAX_AGE_HOURS_ENV]: value })).toBe(144);
    }
  });
});
