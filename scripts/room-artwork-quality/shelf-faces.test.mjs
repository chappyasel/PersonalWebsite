import { SHELF_PLANKS } from "../../src/app/components/stacks/scene/shelfGeometry.ts";
import { extractShelfArtwork } from "../generate/room-artwork-shelf.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { Matrix4, Vector3 } from "three";

import { correctShelfFaceOrder } from "./shelf-faces.mjs";

const manifest = JSON.parse(
  await readFile("scripts/generate/room-artwork-inputs/manifest.json", "utf8"),
);
const polygons = (svg) =>
  [...svg.matchAll(/<polygon\b[^>]*\/>/g)].map((m) => m[0]);
const points = (polygon) =>
  polygon
    .match(/points="([^"]+)"/)[1]
    .split(" ")
    .map((p) => p.split(",").map(Number));

// A point must clear every edge by two raster pixels, excluding the outline.
function inside(point, quad) {
  const cross = quad.map(([x, y], i) => {
    const [nx, ny] = quad[(i + 1) % quad.length];
    return (
      ((nx - x) * (point[1] - y) - (ny - y) * (point[0] - x)) /
      Math.hypot(nx - x, ny - y)
    );
  });
  return cross.every((v) => v > 2) || cross.every((v) => v < -2);
}

for (const c of manifest.cases) {
  test(`${c.unit}/${c.label}: solid tops hide inner walls without moving projected faces`, async () => {
    const source = await readFile(
      `scripts/room-artwork-quality/approved/${c.unit}-${c.label}.svg`,
      "utf8",
    );
    const fixed = correctShelfFaceOrder(source);
    assert.equal(correctShelfFaceOrder(fixed), fixed);
    assert.deepEqual(polygons(fixed).sort(), polygons(source).sort());
    const removeShelf = (s) =>
      s.replace(/<g data-part="shelf"[^>]*>[\s\S]*?<\/g>/, "");
    assert.equal(removeShelf(fixed), removeShelf(source));

    const capture = JSON.parse(
      await readFile(
        `scripts/generate/room-artwork-inputs/${c.inputCapture}`,
        "utf8",
      ),
    );
    const transform = new Matrix4()
      .fromArray(capture.camera.projection)
      .multiply(new Matrix4().fromArray(capture.camera.world).invert())
      .multiply(new Matrix4().fromArray(capture.unitWorld));
    const tops = polygons(fixed).filter((p) =>
      /fill="#(?:bea17e|8d765e)"/.test(p),
    );
    // Confirm the unchanged perspective against both real plank dimensions.
    for (const plank of SHELF_PLANKS) {
      const expected = [-1, 1].flatMap((x) =>
        [-1, 1].map((z) => {
          const p = new Vector3(
            (x * plank.width) / 2,
            plank.centerY + plank.thickness / 2,
            plank.centerZ + (z * plank.depth) / 2,
          ).applyMatrix4(transform);
          return [
            ((p.x + 1) * capture.raster[0]) / 2,
            ((1 - p.y) * capture.raster[1]) / 2,
          ];
        }),
      );
      assert.ok(
        tops.some((top) =>
          expected.every(([x, y]) =>
            points(top).some(([px, py]) => Math.hypot(px - x, py - y) < 0.05),
          ),
        ),
        "Plank corners must match the saved scene camera",
      );
    }

    const render = (svg) =>
      sharp(Buffer.from(extractShelfArtwork(svg)))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const before = await render(source),
      after = await render(fixed);
    const [vx, vy] = capture.viewBox;
    let correctedPixels = 0;
    for (let i = 0; i < after.info.width * after.info.height; i++) {
      // Reordering antialiased overlaps can round alpha by one byte.
      assert.ok(
        Math.abs(after.data[i * 4 + 3] - before.data[i * 4 + 3]) <= 2,
        "Silhouette alpha changed beyond raster rounding",
      );
      assert.equal(
        after.data[i * 4 + 3] > 0,
        before.data[i * 4 + 3] > 0,
        "Silhouette moved",
      );
      const point = [
        vx + (i % after.info.width) + 0.5,
        vy + Math.floor(i / after.info.width) + 0.5,
      ];
      const top = tops.find((p) => inside(point, points(p)));
      if (!top) continue;
      const color = top.match(/fill="#([a-f0-9]+)"/)[1];
      for (let channel = 0; channel < 3; channel++) {
        const expected = parseInt(
          color.slice(channel * 2, channel * 2 + 2),
          16,
        );
        assert.equal(
          after.data[i * 4 + channel],
          expected,
          "Inner wall shaded the plank top",
        );
        if (before.data[i * 4 + channel] !== expected) correctedPixels++;
      }
    }
    assert.ok(
      correctedPixels > 0,
      "Fixture must reproduce the hidden-face defect",
    );
  });
}
