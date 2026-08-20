import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { HOVER_MOTION_SCALE, amplifyHoverMotion, hingeShift } from "./Lift";
import { cameraFacingHoverTilt } from "./hoverTilt";
import { hingePivotForTilt } from "./interaction";

const liftSource = readFileSync(new URL("./Lift.tsx", import.meta.url), "utf8");
const grabbableSource = readFileSync(
  new URL("./Grabbable.tsx", import.meta.url),
  "utf8",
);
const modelPropSource = readFileSync(
  new URL("./ModelProp.tsx", import.meta.url),
  "utf8",
);

describe("shared shelf hover motion", () => {
  it("doubles travel, rotation, and scale delta without changing speed", () => {
    expect(HOVER_MOTION_SCALE).toBe(2);
    expect(amplifyHoverMotion([0, 0.03, 0.02], 0.05, 1.02, 0.06)).toEqual({
      offset: [0, 0.06, 0.04],
      settle: 0.1,
      grow: 1.04,
      tip: 0.12,
    });
  });

  it("preserves explicit refusals", () => {
    expect(amplifyHoverMotion([0, 0, 0], 0, 1, 0)).toEqual({
      offset: [0, 0, 0],
      settle: 0,
      grow: 1,
      tip: 0,
    });
  });

  it("aims every shared hover shell at the live camera", () => {
    expect(liftSource).toContain("cameraFacingHoverTilt");
    expect(grabbableSource).toContain("cameraFacingHoverTilt");
    expect(modelPropSource).toContain("cameraFacingHoverTilt");
    expect(grabbableSource).not.toContain(
      "const target = wants && hinge.current ? TIP",
    );
    expect(modelPropSource).not.toContain("const tn = on && pivot ? TIP : 0");
  });

  it("chooses the tilt sign from the camera's height and caps its travel", () => {
    expect(cameraFacingHoverTilt({ y: 1, z: 5 }, 0.12)).toBeCloseTo(-0.12);
    expect(cameraFacingHoverTilt({ y: -1, z: 5 }, 0.12)).toBeCloseTo(0.12);
    expect(cameraFacingHoverTilt({ y: 0, z: 5 }, 0.12)).toBe(0);
    expect(cameraFacingHoverTilt({ y: 1, z: 5 }, 0)).toBe(0);
  });

  it("hinges a backward tilt from the rear so the front rises", () => {
    const front = new THREE.Vector3(0, -1, 0.5);
    const rear = new THREE.Vector3(0, -1, -0.5);
    const hinge = {
      positiveTiltPivot: front,
      negativeTiltPivot: rear,
      size: 1,
      reason: null,
    };

    expect(hingePivotForTilt(hinge, -0.12)).toBe(rear);
    expect(hingePivotForTilt(hinge, 0.12)).toBe(front);

    const rotation = new THREE.Euler(-0.12, 0, 0);
    const shift = hingeShift(rear, rotation, undefined).clone();
    const movedRear = rear.clone().applyEuler(rotation).add(shift);
    const movedFront = front.clone().applyEuler(rotation).add(shift);
    expect(movedRear.y).toBeCloseTo(rear.y);
    expect(movedFront.y).toBeGreaterThan(front.y);
  });
});
