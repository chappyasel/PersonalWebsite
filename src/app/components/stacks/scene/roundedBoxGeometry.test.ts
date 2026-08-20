import { Vector3 } from "three";
import { afterEach, describe, expect, it } from "vitest";

import {
  ROUNDED_BOX_DEFAULTS,
  clearRoundedBoxCache,
  roundedBoxCacheKey,
  roundedBoxCacheSize,
  roundedBoxGeometry,
} from "./roundedBoxGeometry";

afterEach(() => clearRoundedBoxCache());

// A real shelf plank. The radius matters: drei's default 0.05 exceeds half
// the height of most boxes in this room, which makes `height - radius * 2`
// negative and the shape degenerate. Every call site passes its own small
// radius for that reason.
const box = { width: 0.4, height: 0.06, depth: 0.3, radius: 0.008 } as const;
/** Cubic enough for the default radius to be valid. */
const cube = { width: 0.4, height: 0.4, depth: 0.4 } as const;

describe("rounded box geometry cache", () => {
  it("builds one geometry per distinct box, however many ask for it", () => {
    // The reason this exists: 35 call sites, almost all repeating a handful
    // of dimensions, each previously paying a full extrude plus a
    // creased-normals pass that allocates a string per vertex.
    const first = roundedBoxGeometry(box);
    for (let i = 0; i < 20; i += 1)
      expect(roundedBoxGeometry(box)).toBe(first);
    expect(roundedBoxCacheSize()).toBe(1);
  });

  it("does not confuse boxes that differ in any parameter", () => {
    const keys = new Set<string>();
    for (const spec of [
      box,
      { ...box, width: 0.41 },
      { ...box, height: 0.061 },
      { ...box, depth: 0.31 },
      { ...box, radius: 0.006 },
      { ...box, steps: 2 },
      { ...box, smoothness: 3 },
      { ...box, bevelSegments: 2 },
      { ...box, creaseAngle: 0.6 },
    ]) {
      keys.add(roundedBoxCacheKey(spec));
      roundedBoxGeometry(spec);
    }
    expect(keys.size).toBe(9);
    expect(roundedBoxCacheSize()).toBe(9);
  });

  it("treats an omitted parameter as drei's default, not as absent", () => {
    // Otherwise the same box reached through two call sites — one spelling
    // out `radius={0.05}`, one leaving it off — would build twice.
    expect(roundedBoxCacheKey(cube)).toBe(
      roundedBoxCacheKey({ ...cube, ...ROUNDED_BOX_DEFAULTS }),
    );
    expect(roundedBoxGeometry(cube)).toBe(
      roundedBoxGeometry({ ...cube, ...ROUNDED_BOX_DEFAULTS }),
    );
  });

  it("produces a usable mesh with creased normals applied", () => {
    const geometry = roundedBoxGeometry(box);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    expect(position.count).toBeGreaterThan(0);
    expect(normal).toBeTruthy();
    expect(normal.count).toBe(position.count);
    // Creasing normalises every normal; a zero-length one would render black.
    for (let i = 0; i < normal.count; i += Math.ceil(normal.count / 50)) {
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      expect(length).toBeGreaterThan(0.9);
    }
  });

  it("centres the box on its own origin, as drei does", () => {
    const geometry = roundedBoxGeometry(box);
    geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    for (const axis of ["x", "y", "z"] as const)
      expect(Math.abs(b.min[axis] + b.max[axis])).toBeLessThan(1e-6);
  });

  it("matches the requested outer dimensions", () => {
    // The shape is built from an inset rounded rectangle plus a bevel, so a
    // mistake here silently resizes every box in the room rather than
    // throwing.
    const geometry = roundedBoxGeometry(box);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(box.width, 4);
    expect(size.y).toBeCloseTo(box.height, 4);
    expect(size.z).toBeCloseTo(box.depth, 4);
  });
});
