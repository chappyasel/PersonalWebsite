import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  type Point2,
  convexHull2D,
  labelShellGeometry,
  orderForLabel,
  wallFootprint,
} from "./labelShell";

/** The tub's plan: a rounded square, corners chamfered, slightly off-centre
 * the way the real mesh is (its origin is not the tub's axis). */
function roundedSquare(r = 0.25, chamfer = 0.08, ox = 0.02, oz = -0.03) {
  const pts: Point2[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    // Superellipse-ish: blend circle and square.
    const x = Math.cos(a);
    const z = Math.sin(a);
    const sq = Math.max(Math.abs(x), Math.abs(z));
    const k = r * (1 - chamfer) * (1 / sq) + r * chamfer;
    pts.push([ox + x * k, oz + z * k]);
  }
  return pts;
}

describe("convexHull2D", () => {
  it("drops interior and collinear points", () => {
    const hull = convexHull2D([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5],
      [0.5, 0],
    ]);
    expect(hull).toHaveLength(4);
    for (const p of hull) {
      expect([0, 1]).toContain(p[0]);
      expect([0, 1]).toContain(p[1]);
    }
  });
});

describe("orderForLabel", () => {
  it("starts at the back and reaches the front via the viewer's left", () => {
    const ring = orderForLabel(convexHull2D(roundedSquare()));
    // Rearmost first.
    const minZ = Math.min(...ring.map((p) => p[1]));
    expect(ring[0]![1]).toBeCloseTo(minZ, 10);
    // Then toward -x.
    expect(ring[1]![0]).toBeLessThan(ring[ring.length - 1]![0]);
    // The frontmost point sits near the middle of the walk (u ≈ 0.5).
    let front = 0;
    for (let i = 1; i < ring.length; i++) {
      if (ring[i]![1] > ring[front]![1]) front = i;
    }
    expect(Math.abs(front / ring.length - 0.5)).toBeLessThan(0.08);
  });
});

describe("labelShellGeometry", () => {
  it("wraps the outline once with u from 0 to 1 and outward normals", () => {
    const geo = labelShellGeometry(roundedSquare(), 0.1, 0.4, 1.02);
    const pos = geo.attributes.position!;
    const uv = geo.attributes.uv!;
    const nor = geo.attributes.normal!;
    expect(pos.count).toBeGreaterThan(6);
    // First and last columns close the loop: same x/z, u 0 and 1.
    const last = pos.count - 2;
    expect(pos.getX(0)).toBeCloseTo(pos.getX(last), 6);
    expect(pos.getZ(0)).toBeCloseTo(pos.getZ(last), 6);
    expect(uv.getX(0)).toBe(0);
    expect(uv.getX(last)).toBeCloseTo(1, 6);
    // u is monotonic along the walk; v alternates 0/1 per column.
    for (let i = 2; i < pos.count; i += 2) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(uv.getX(i - 2));
      expect(uv.getY(i)).toBe(0);
      expect(uv.getY(i + 1)).toBe(1);
      // Float32 storage: ~1e-9 of slop on 0.1.
      expect(pos.getY(i)).toBeCloseTo(0.1, 6);
      expect(pos.getY(i + 1)).toBeCloseTo(0.4, 6);
    }
    // Every normal points away from the centroid, in the plane.
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < pos.count; i += 2) {
      cx += pos.getX(i);
      cz += pos.getZ(i);
    }
    cx /= pos.count / 2;
    cz /= pos.count / 2;
    for (let i = 0; i < pos.count; i++) {
      const dot =
        nor.getX(i) * (pos.getX(i) - cx) + nor.getZ(i) * (pos.getZ(i) - cz);
      expect(dot).toBeGreaterThan(0);
      expect(nor.getY(i)).toBe(0);
    }
  });

  it("sits proud of the wall by the inflate factor", () => {
    const outline = roundedSquare();
    const geo = labelShellGeometry(outline, 0, 1, 1.05);
    const pos = geo.attributes.position!;
    const hull = convexHull2D(outline);
    let cx = 0;
    let cz = 0;
    for (const [x, z] of hull) {
      cx += x;
      cz += z;
    }
    cx /= hull.length;
    cz /= hull.length;
    const wallMax = Math.max(
      ...hull.map(([x, z]) => Math.hypot(x - cx, z - cz)),
    );
    let shellMax = 0;
    for (let i = 0; i < pos.count; i += 2) {
      shellMax = Math.max(
        shellMax,
        Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz),
      );
    }
    expect(shellMax).toBeCloseTo(wallMax * 1.05, 6);
  });
});

describe("wallFootprint", () => {
  it("slices the named material between height fractions, in scaled world units", () => {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8, 1, true),
      new THREE.MeshStandardMaterial({ name: "Body" }),
    );
    body.geometry.translate(0, 0.1, 0); // bottom at origin
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8, 1, true),
      new THREE.MeshStandardMaterial({ name: "Lid" }),
    );
    lid.geometry.translate(0, 0.22, 0);
    const root = new THREE.Group();
    root.add(body, lid);
    root.scale.setScalar(0.5);
    const { points, yMin, yMax } = wallFootprint(root, {
      scale: 2,
      materialName: "Body",
      from: 0.25,
      to: 0.75,
    });
    // root scale 0.5 × scale 2 = identity on the body's own numbers.
    expect(yMin).toBeCloseTo(0, 6);
    expect(yMax).toBeCloseTo(0.2, 6);
    // An open cylinder with one height segment has rings only at y=0 and
    // y=0.2. Cutting the wall's edges still yields a full footprint in the
    // 25–75% band, at the body's radius, ignoring the lid's 0.12.
    expect(points.length).toBeGreaterThanOrEqual(8);
    // Cuts land on the wall's edges, i.e. on the chords of the 8-gon, so the
    // radius reads between the inradius and the circumradius.
    for (const [x, z] of points) {
      const r = Math.hypot(x, z);
      expect(r).toBeGreaterThanOrEqual(0.1 * Math.cos(Math.PI / 8) - 1e-6);
      expect(r).toBeLessThanOrEqual(0.1 + 1e-6);
    }
    // And the cut really is between the planes asked for: no cut lands on
    // the rings themselves.
    const again = wallFootprint(root, {
      scale: 2,
      materialName: "Body",
      from: 0.5,
      to: 0.5,
      cuts: 1,
    });
    expect(again.points.length).toBeGreaterThanOrEqual(8);
  });
});
