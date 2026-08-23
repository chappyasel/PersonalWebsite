import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { projectStandingBagUvs } from "./bagLabelUvs";

/** A box standing on y=0 with its big faces on ±x, like Kenney's bag:
 * 0.22 deep (x), 0.6 tall (y), 0.41 wide (z). BoxGeometry gives every face
 * its own vertices and flat normals, as the GLB does. */
function standingBag() {
  const geo = new THREE.BoxGeometry(0.22, 0.6, 0.41);
  geo.translate(0, 0.3, 0);
  return geo;
}

describe("projectStandingBagUvs", () => {
  it("charts the front face across z and up y, unstretched", () => {
    const { geometry, size } = projectStandingBagUvs(standingBag());
    expect(size.width).toBeCloseTo(0.41, 6);
    expect(size.height).toBeCloseTo(0.6, 6);
    expect(size.depth).toBeCloseTo(0.22, 6);
    const pos = geometry.attributes.position!;
    const nor = geometry.attributes.normal!;
    const uv = geometry.attributes.uv!;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      expect(u).toBeGreaterThanOrEqual(-1e-6);
      expect(u).toBeLessThanOrEqual(1 + 1e-6);
      // v is height everywhere.
      expect(v).toBeCloseTo(pos.getY(i) / 0.6, 6);
      if (nor.getX(i) > 0.5) {
        // Front: u counts DOWN z (model +z is the viewer's left once yawed).
        expect(u).toBeCloseTo((0.205 - pos.getZ(i)) / 0.41, 6);
      } else if (nor.getX(i) < -0.5) {
        // Back: mirrored, so it reads from behind.
        expect(u).toBeCloseTo((pos.getZ(i) + 0.205) / 0.41, 6);
      }
    }
  });

  it("puts the sides on the chart's edge columns and the bottom on v = 0", () => {
    const { geometry } = projectStandingBagUvs(standingBag());
    const pos = geometry.attributes.position!;
    const nor = geometry.attributes.normal!;
    const uv = geometry.attributes.uv!;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(nor.getZ(i)) > 0.5) {
        const u = uv.getX(i);
        expect(Math.min(u, 1 - u)).toBeCloseTo(0, 6);
      }
      if (nor.getY(i) < -0.5) expect(uv.getY(i)).toBeCloseTo(0, 6);
      if (nor.getY(i) > 0.5) expect(uv.getY(i)).toBeCloseTo(1, 6);
    }
  });

  it("returns a clone and leaves the source alone", () => {
    const src = standingBag();
    const before = src.attributes.uv!.array.slice();
    const { geometry } = projectStandingBagUvs(src);
    expect(geometry).not.toBe(src);
    expect(Array.from(src.attributes.uv!.array)).toEqual(Array.from(before));
  });
});
