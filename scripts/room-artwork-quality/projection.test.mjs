import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Matrix4, Vector3 } from "three";

import { cropProjection } from "./projection.mjs";

test("saved desktop and phone off-axis projections map independently into supersampled crops", async () => {
  for (const unit of ["projects", "talks", "systems"])
    for (const view of ["desktop", "phone"]) {
      const c = JSON.parse(
        await readFile(
          `scripts/generate/room-artwork-inputs/${unit}/light-${view}/capture.json`,
          "utf8",
        ),
      );
      const box = [125, 234, 189, 253],
        worldToCamera = new Matrix4().fromArray(c.camera.world).invert();
      for (const probe of c.probes) {
        const point = new Vector3()
          .fromArray(probe.capturedCoordinates ?? probe.sample.coordinates)
          .applyMatrix4(new Matrix4().fromArray(probe.localMatrix))
          .applyMatrix4(new Matrix4().fromArray(c.unitWorld))
          .applyMatrix4(worldToCamera);
        const original = point
          .clone()
          .applyMatrix4(new Matrix4().fromArray(c.camera.projection));
        const cropped = point
          .clone()
          .applyMatrix4(cropProjection(c.camera.projection, c.raster, box));
        const expected = [
          (((original.x + 1) * c.raster[0]) / 2 - box[0]) * 4,
          (((1 - original.y) * c.raster[1]) / 2 - box[1]) * 4,
        ];
        const actual = [
          (cropped.x + 1) * box[2] * 2,
          (1 - cropped.y) * box[3] * 2,
        ];
        assert.ok(
          Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < 1e-8,
        );
      }
    }
});
