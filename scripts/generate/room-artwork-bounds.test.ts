import type { RoomArtworkRegistration } from "../../src/app/components/stacks/illustration/artwork/types";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { roundedBoxGeometry } from "./room-artwork-inputs/captured-source/roundedBoxGeometry";
import { SHELF_PLANKS } from "./room-artwork-inputs/captured-source/shelfGeometry";
import manifest from "./room-artwork-inputs/manifest.json";
import { sha256 } from "./room-artwork.mjs";

const archiveRevision = "e0becc7d4c4ff87595683ccf85191ee76ff04595";
const top = SHELF_PLANKS[0]!;
const geometry = roundedBoxGeometry({
  width: top.width,
  height: top.thickness,
  depth: top.depth,
  radius: 0.012,
  smoothness: 4,
});
geometry.computeBoundingBox();

describe("immutable captured shelf bounds", () => {
  it("preserves all 96 expected corners from the archived constructor through generation", () => {
    expect(top.id).toBe("top");
    expect([top.width, top.thickness, top.depth]).toEqual([2.64, 0.07, 0.85]);
    let count = 0;
    for (const entry of manifest.cases) {
      const inputBytes = readFileSync(
        `scripts/generate/room-artwork-inputs/${entry.inputCapture}`,
      );
      expect(sha256(inputBytes)).toBe(entry.captureSha256);
      const input = JSON.parse(
        inputBytes.toString(),
      ) as RoomArtworkRegistration;
      const output = JSON.parse(
        readFileSync(
          `public/images/stacks/boot/${entry.unit}/${entry.label}.registration.json`,
          "utf8",
        ),
      ) as RoomArtworkRegistration;
      expect(output.probes).toEqual(input.probes);
      expect(input.boundsProbeProvenance?.sourceRevision).toBe(archiveRevision);
      for (const source of input.boundsProbeProvenance!.sources) {
        if (source.snapshot)
          expect(sha256(readFileSync(source.snapshot))).toBe(source.sha256);
      }
      const bounds = input.probes.filter((p) => p.sample.kind === "bounds");
      expect(bounds).toHaveLength(4);
      for (const probe of bounds) {
        expect(
          probe.path.endsWith(`shelf-structure:${entry.index}/Mesh[0]`),
        ).toBe(true);
        const [x, y, z] = probe.sample.coordinates;
        expect(y).toBe(1);
        const expected = [x ? 1.32 : -1.32, 0.035, z ? 0.425 : -0.425];
        expect(probe.capturedCoordinates).toEqual(expected);
        const box = geometry.boundingBox!;
        const archivedEnvelope = [
          x ? box.max.x : box.min.x,
          box.max.y,
          z ? box.max.z : box.min.z,
        ];
        // RoundedBox's epsilon and Float32 positions expand nominal x/y by ~5e-6.
        expect(
          Math.max(
            ...archivedEnvelope.map((v, i) => Math.abs(v - expected[i]!)),
          ),
        ).toBeLessThan(0.000006);
        count++;
      }
    }
    expect(count).toBe(96);
  });

  it("keeps the expected point fixed when same-type mounted bounds grow", () => {
    const input = JSON.parse(
      readFileSync(
        "scripts/generate/room-artwork-inputs/talks/light-desktop/capture.json",
        "utf8",
      ),
    ) as RoomArtworkRegistration;
    const probe = input.probes.find((p) => p.id === "shelf-top-1")!;
    const captured = [...probe.capturedCoordinates!];
    const resized = geometry.clone().scale(1.2, 1, 1);
    resized.computeBoundingBox();
    expect(resized.type).toBe(geometry.type);
    expect(resized.boundingBox!.max.x - captured[0]!).toBeGreaterThan(0.26);
    expect(probe.capturedCoordinates).toEqual([1.32, 0.035, -0.425]);
    resized.dispose();
  });
});
