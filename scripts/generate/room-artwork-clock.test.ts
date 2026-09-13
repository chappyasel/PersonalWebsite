import { approvedSnapshot } from "../room-artwork-quality/approved-snapshot.mjs";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { verifyCapturedClockRotation } from "./room-artwork-clock.mjs";
import { sha256 } from "./room-artwork.mjs";

type ClockCapture = Parameters<typeof verifyCapturedClockRotation>[0];

// Pinned to the accepted B archive, before the metadata repair.
const approved = [
  {
    label: "light-desktop",
    raw: "d0c88d1b410c2ca57e273baabec795d74368229bdf961c701b924a091024e0f1",
    pose: "e0e6425302ef5283220b50d5697826651fdf57b38d6201598521ffcf35598831",
    svg: "c77cf2cd7002156e4ca122e790730b2535309742e838fc03e4f8f02e71da6059",
  },
  {
    label: "dark-desktop",
    raw: "30a1287ffff7ae2a0c31a15df03fce70bbc1058405ec6cd6ebc00c0bcf578209",
    pose: "952f3a1ec57c0ee5c7ffcef26bd58f64076ed657502e09fca480c3cffa4d6213",
    svg: "9fb94c4cc80e229185efc4a993651621865747dc989c2119c5ac70b19aa95dd1",
  },
  {
    label: "light-phone",
    raw: "01460708908a7638e0b059a4ba109f1600d4235f9135e5afc3d9eb7064fb3c58",
    pose: "1afe6a4f510a55c4848bc882e8c70eda1c311bfb78ecc32a929652bc83ed64bc",
    svg: "72e71496da6dd472314248e68e0a4a3b5a823157bddb64e9c496e7dbb3ede0d5",
  },
  {
    label: "dark-phone",
    raw: "f709a5a0e7010d7145121d716a2780af80f27b6bd0cf88bf28dc8711876a7c2b",
    pose: "69183509bb105f2ba9742b68ad753855467a72ff13e03a272eb20a6212a49086",
    svg: "1822ea5208e08779b33510dedd93dc2bd5d35dbd3c71526a06abf34b88338cce",
  },
];

function input(label = "light-desktop") {
  return JSON.parse(
    readFileSync(
      `scripts/generate/room-artwork-inputs/systems/${label}/capture.json`,
      "utf8",
    ),
  ) as ClockCapture;
}

describe("archived Systems clock rotations", () => {
  it.each(approved)(
    "reconstructs both hands in $label without changing the approved pose or SVG",
    async ({ label, raw, pose, svg }) => {
      const capture = input(label);
      expect(capture.sourceRevision).toBe(
        "e0becc7d4c4ff87595683ccf85191ee76ff04595",
      );
      expect(capture.rawCapture).toEqual({
        path: `docs/reviews/room-boot-shelf-evidence/systems/${label}.json`,
        sha256: raw,
      });
      expect(
        capture.owners.find(({ id }) => id === "egg-clock-alarm")?.poseSha256,
      ).toBe(pose);
      expect(() => verifyCapturedClockRotation(capture)).not.toThrow();
      expect(sha256(await approvedSnapshot("systems", label))).toBe(svg);
    },
  );

  it.each(approved)("rejects a changed hand phase in $label", ({ label }) => {
    const capture = input(label);
    capture.liveRotations[0]!.rotation[2]! += 0.01;
    expect(() => verifyCapturedClockRotation(capture)).toThrow(
      "Captured clock rotation misses archived hand",
    );
  });

  it("rejects provenance from a different raw capture", () => {
    const capture = input();
    capture.liveRotationProvenance!.rawCapture.sha256 = approved[1]!.raw;
    expect(() => verifyCapturedClockRotation(capture)).toThrow(
      "mismatched archived clock provenance",
    );
  });

  it("rejects changed archived matrices against the approved pose hash", () => {
    const capture = input();
    capture.liveRotationProvenance!.localMatrices[2]![13]! += 0.01;
    expect(() => verifyCapturedClockRotation(capture)).toThrow(
      "Archived clock matrices differ from the approved pose",
    );
  });

  it.each([2, 3])(
    "checks hand matrix %i independently even if its pose hash is rewritten",
    (index) => {
      const capture = input();
      const matrices = capture.liveRotationProvenance!.localMatrices;
      matrices[index]![13]! += 0.01;
      capture.owners.find(({ id }) => id === "egg-clock-alarm")!.poseSha256 =
        sha256(
          JSON.stringify(
            matrices.map((matrix) =>
              matrix.map((value) => Number(value.toFixed(6))),
            ),
          ),
        );
      expect(() => verifyCapturedClockRotation(capture)).toThrow(
        `Captured clock rotation misses archived hand ${index - 2}`,
      );
    },
  );

  it("rejects missing rotation evidence", () => {
    const capture = input();
    delete capture.liveRotationProvenance;
    expect(() => verifyCapturedClockRotation(capture)).toThrow(
      "Missing or mismatched archived clock provenance",
    );
  });
});
