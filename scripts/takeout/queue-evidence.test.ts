import { describe, expect, it } from "vitest";

import {
  type ManageExportObservation,
  type QueueObservation,
  confirmQueueEvidence,
  driveArchiveObservation,
  manageQueueObservation,
  pendingPossiblyYouTubeExports,
  trustedQueueExports,
  unknownObservation,
} from "./queue-evidence";

const observedAt = "2026-10-04T18:00:00.000Z";

function card(
  overrides: Partial<ManageExportObservation> = {},
): ManageExportObservation {
  return {
    exportId: "export-new",
    status: "in_progress",
    products: ["youtube and youtube music"],
    createdAtText: "Oct 4, 2026",
    ...overrides,
  };
}

function queue(exports: ManageExportObservation[]): QueueObservation {
  return manageQueueObservation(exports, observedAt);
}

describe("confirmQueueEvidence", () => {
  it("confirms an identified in-progress YouTube card that no earlier snapshot held", () => {
    const verdict = confirmQueueEvidence({
      observation: queue([card()]),
      pendingBefore: [],
    });
    expect(verdict).toEqual({
      confirmed: true,
      evidence: {
        source: "takeout_manage_queue",
        exportId: "export-new",
        createdAtText: "Oct 4, 2026",
        observedAt,
      },
    });
  });

  it("refuses to confirm without any observation at all", () => {
    expect(
      confirmQueueEvidence({ observation: null, pendingBefore: [] }),
    ).toEqual({ confirmed: false, reason: "no_observation" });
  });

  it("never accepts a fresh Drive zip as proof that YouTube queued", () => {
    const drive = driveArchiveObservation(
      {
        fileId: "drive-file-1",
        name: "takeout-20261004T175000Z-1-001.zip",
        createdAt: "2026-10-04T17:55:00.000Z",
      },
      observedAt,
    );
    expect(
      confirmQueueEvidence({ observation: drive, pendingBefore: [] }),
    ).toEqual({ confirmed: false, reason: "not_a_queue_source" });
  });

  it("refuses to confirm from a reached URL or a completed archive card", () => {
    expect(
      confirmQueueEvidence({
        observation: queue([card({ status: "complete" })]),
        pendingBefore: [],
      }),
    ).toEqual({ confirmed: false, reason: "no_in_progress_export" });
    expect(
      confirmQueueEvidence({ observation: queue([]), pendingBefore: [] }),
    ).toEqual({ confirmed: false, reason: "no_in_progress_export" });
  });

  it("does not credit this attempt with an export that was already pending", () => {
    const already = card({ exportId: "export-old" });
    expect(
      confirmQueueEvidence({
        observation: queue([already]),
        pendingBefore: [already],
      }),
    ).toEqual({ confirmed: false, reason: "pre_existing_export" });
  });

  it("credits a new identified card even when an older one is still pending", () => {
    const verdict = confirmQueueEvidence({
      observation: queue([card({ exportId: "export-old" }), card()]),
      pendingBefore: [card({ exportId: "export-old" })],
    });
    expect(verdict).toMatchObject({
      confirmed: true,
      evidence: { exportId: "export-new" },
    });
  });

  it("confirms nothing at all without a pre-attempt baseline", () => {
    expect(
      confirmQueueEvidence({
        observation: queue([card()]),
        pendingBefore: null,
      }),
    ).toEqual({ confirmed: false, reason: "no_baseline" });
  });

  it("stays ambiguous when an unidentified card could be the export already pending", () => {
    expect(
      confirmQueueEvidence({
        observation: queue([card({ exportId: null })]),
        pendingBefore: [card({ exportId: null })],
      }),
    ).toEqual({ confirmed: false, reason: "ambiguous_unidentified" });
  });

  it("accepts an unidentified card only when nothing was pending beforehand", () => {
    expect(
      confirmQueueEvidence({
        observation: queue([card({ exportId: null })]),
        pendingBefore: [],
      }),
    ).toMatchObject({ confirmed: true, evidence: { exportId: null } });
  });

  it("ignores a card that names other products only", () => {
    expect(
      confirmQueueEvidence({
        observation: queue([card({ products: ["google photos"] })]),
        pendingBefore: [],
      }),
    ).toEqual({ confirmed: false, reason: "product_mismatch" });
  });

  it("will not call success on a card that never says YouTube", () => {
    expect(
      confirmQueueEvidence({
        observation: queue([card({ products: [] })]),
        pendingBefore: [],
      }),
    ).toEqual({ confirmed: false, reason: "product_unknown" });
  });

  it("never confirms from an observation that failed to read the queue", () => {
    for (const reason of ["unreadable", "auth_gate", "not_takeout", "missing"] as const) {
      expect(
        confirmQueueEvidence({
          observation: unknownObservation(reason, observedAt),
          pendingBefore: [],
        }),
      ).toEqual({ confirmed: false, reason: "not_a_queue_source" });
    }
  });
});

describe("suppression versus confirmation", () => {
  it("counts a card with no products as possibly ours, to avoid a duplicate", () => {
    expect(pendingPossiblyYouTubeExports([card({ products: [] })])).toHaveLength(1);
    expect(pendingPossiblyYouTubeExports([card()])).toHaveLength(1);
  });

  it("does not count another product, or anything already finished", () => {
    expect(
      pendingPossiblyYouTubeExports([
        card({ products: ["google photos"] }),
        card({ status: "complete" }),
        card({ status: "unknown" }),
      ]),
    ).toEqual([]);
  });
});

describe("trustedQueueExports", () => {
  it("returns rows only from a parsed Takeout queue", () => {
    expect(trustedQueueExports(queue([]))).toEqual([]);
    expect(trustedQueueExports(queue([card()]))).toHaveLength(1);
  });

  it("refuses to turn a missing, gated or Drive observation into an empty queue", () => {
    expect(trustedQueueExports(null)).toBeNull();
    expect(trustedQueueExports(unknownObservation("auth_gate", observedAt))).toBeNull();
    expect(trustedQueueExports(unknownObservation("unreadable", observedAt))).toBeNull();
    expect(
      trustedQueueExports(
        driveArchiveObservation(
          { fileId: "f", name: "takeout-20261004T175000Z-1-001.zip", createdAt: observedAt },
          observedAt,
        ),
      ),
    ).toBeNull();
  });
});
