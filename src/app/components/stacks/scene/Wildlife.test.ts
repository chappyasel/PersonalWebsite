import { describe, expect, it } from "vitest";

import {
  createMothConeBasis,
  createWildlifeGeometrySet,
  mothConeBasis,
} from "./Wildlife";
import {
  MOTH_FLIGHT,
  MOTH_ILLUMINATION,
  createMothFrame,
  mothFrame,
} from "./wildlifeBehavior";

describe("wildlife geometry construction", () => {
  it("builds every procedural client geometry", () => {
    const geometries = createWildlifeGeometrySet();
    try {
      for (const geometry of Object.values(geometries)) {
        expect(geometry.getAttribute("position").count).toBeGreaterThan(0);
        expect(geometry.boundingSphere).not.toBeNull();
      }
    } finally {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
    }
  });

  it("orients tilted moth cones into open air without folding the path", () => {
    const directions = [
      { x: -1, y: -1, z: 0.16 },
      { x: 1, y: -0.8, z: -0.35 },
      { x: 0.043, y: -1.44, z: 0.999 },
      { x: 0, y: -1, z: 0 },
    ];
    for (const direction of directions) {
      const basis = createMothConeBasis();
      expect(mothConeBasis(direction.x, direction.y, direction.z, basis)).toBe(
        basis,
      );
      expect(basis.basisAZ).toBeGreaterThanOrEqual(0);
      expect(basis.basisBZ).toBeGreaterThanOrEqual(0);
      for (let t = 0; t < 60; t += 0.1) {
        const frame = mothFrame(
          0,
          t,
          1,
          MOTH_FLIGHT.nearDistance,
          MOTH_FLIGHT.farDistance,
          MOTH_FLIGHT.maxRadius,
          createMothFrame(),
          basis.openAirXStrength,
        );
        if (basis.openAirXStrength > 0)
          expect(frame.x).toBeGreaterThanOrEqual(0);
        const cameraSideOffset =
          basis.basisAZ * frame.x + basis.basisBZ * frame.z;
        expect(cameraSideOffset).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps shifted moth derivatives and cone illumination on rendered X", () => {
    const basis = mothConeBasis(1, -0.8, -0.35, createMothConeBasis());
    expect(basis.openAirXStrength).toBe(1);
    const h = 0.0001;
    for (let t = 3; t < 15; t += 0.37) {
      const sample = (time: number) =>
        mothFrame(
          2,
          time,
          1,
          MOTH_FLIGHT.nearDistance,
          MOTH_FLIGHT.farDistance,
          MOTH_FLIGHT.maxRadius,
          createMothFrame(),
          basis.openAirXStrength,
        );
      const before = sample(t - h);
      const frame = sample(t);
      const after = sample(t + h);
      expect(frame.velocityX).toBeCloseTo((after.x - before.x) / (2 * h), 4);
      expect(frame.accelerationX).toBeCloseTo(
        (after.velocityX - before.velocityX) / (2 * h),
        3,
      );

      const axialRange = MOTH_FLIGHT.farDistance - MOTH_FLIGHT.nearDistance;
      const axialU = Math.min(
        1,
        Math.max(0, (-frame.y - MOTH_FLIGHT.nearDistance) / axialRange),
      );
      const coneRadius = MOTH_FLIGHT.maxRadius * (0.22 + 0.78 * axialU);
      const centerLight = Math.min(
        1,
        Math.max(0, 1 - Math.hypot(frame.x, frame.z) / coneRadius),
      );
      // The illumination floor is 0.05, not 0.32, and the falloff continues
      // past the cone edge — a moth can leave the light now, so leaving it has
      // to read as leaving it (ADR 0007).
      const expectedIllumination =
        (1 - 0.35 * axialU) *
        (MOTH_ILLUMINATION.floor + centerLight * (1 - MOTH_ILLUMINATION.floor));
      expect(frame.illumination).toBeCloseTo(expectedIllumination, 10);
    }
  });
});
