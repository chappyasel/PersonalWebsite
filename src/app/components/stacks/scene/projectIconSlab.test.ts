import { describe, expect, it } from "vitest";

import { projectIconBody } from "./projectIconGeometry";
import {
  PROJECT_ICON_SLAB_BACK,
  PROJECT_ICON_SLAB_FRONT,
  createProjectIconSlabGeometry,
} from "./projectIconSlab";

describe("app-icon slab", () => {
  it.each([0.16, 0.32])(
    "keeps the rounded %s tile within its physical bounds",
    (size) => {
      const body = projectIconBody(size);
      const geometry = createProjectIconSlabGeometry(body);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(body.size, 5);
      expect(bounds.max.y - bounds.min.y).toBeCloseTo(body.size, 5);
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(body.depth, 6);
      expect(body.depth - body.edgeRadius * 2).toBeGreaterThan(0);

      const positions = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      const indices = geometry.getIndex()!;
      for (const [material, direction] of [
        [PROJECT_ICON_SLAB_FRONT, 1],
        [PROJECT_ICON_SLAB_BACK, -1],
      ] as const) {
        const cap = geometry.groups.find(
          (group) => group.materialIndex === material,
        )!;
        expect(cap.count).toBeGreaterThan(0);
        for (let i = cap.start; i < cap.start + cap.count; i++) {
          const vertex = indices.getX(i);
          expect(positions.getZ(vertex)).toBeCloseTo(
            (direction * body.depth) / 2,
            6,
          );
          expect(normals.getZ(vertex) * direction).toBeGreaterThan(0);
        }
      }
      for (const value of normals.array)
        expect(Number.isFinite(value)).toBe(true);
      geometry.dispose();
    },
  );
});
