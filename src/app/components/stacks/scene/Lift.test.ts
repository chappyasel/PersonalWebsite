import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { HOVER_MOTION_SCALE, amplifyHoverMotion, hingeShift } from "./Lift";
import { cameraFacingHoverTilt, cameraSideHoverTilt } from "./hoverTilt";
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
  it("amplifies travel, rotation, and scale delta without changing speed", () => {
    // The dial is the scene's one legibility control. Every hover band states
    // its peak as a base times this, so turning it up moves the whole world
    // rather than the half of it that remembered to multiply.
    expect(HOVER_MOTION_SCALE).toBe(2.5);
    expect(amplifyHoverMotion([0, 0.03, 0.02], 0.05, 1.02, 0.06)).toEqual({
      offset: [0, 0.075, 0.05],
      settle: 0.125,
      grow: 1.05,
      tip: 0.15,
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

  it("leans every shared hover shell TOWARD the live camera", () => {
    // All three nod sites moved off the face-showing solver on 2026-08-20.
    // `cameraFacingHoverTilt` returned the camera's ELEVATION over the prop
    // capped by the constant, so a top-shelf prop tilted 2.1 degrees however
    // large the constant grew, and it leaned the top AWAY from a camera
    // sitting above. Both are why the nod kept reading as too subtle and as a
    // recoil. This asserts none of the three quietly goes back.
    for (const source of [liftSource, grabbableSource, modelPropSource]) {
      expect(source).toContain("cameraSideHoverTilt");
      expect(source).not.toContain("cameraFacingHoverTilt");
    }
    expect(grabbableSource).not.toContain(
      "const target = wants && hinge.current ? TIP",
    );
    expect(modelPropSource).not.toContain("const tn = on && pivot ? TIP : 0");
  });

  it("leans by the authored angle wherever the prop sits", () => {
    // The property the nod actually needed. This camera sits at y 0.25, z 5.8,
    // so its elevation over a top-shelf prop is ~2.1 degrees, over a
    // lower-shelf one ~10.9, and over a floor prop ~13.2. The face-showing
    // solver handed back those numbers; this one hands back the constant.
    const angle = 0.225;
    expect(cameraSideHoverTilt({ z: 5.8 }, angle)).toBe(angle);
    // ...and it leans the top TOWARD the camera, which `hingePivotForTilt`
    // then answers with the front-bottom edge, so the rear is what lifts.
    expect(cameraSideHoverTilt({ z: 5.8 }, angle)).toBeGreaterThan(0);
  });

  it("chooses the tilt sign from the camera's height and caps its travel", () => {
    expect(cameraFacingHoverTilt({ y: 1, z: 5 }, 0.12)).toBeCloseTo(-0.12);
    expect(cameraFacingHoverTilt({ y: -1, z: 5 }, 0.12)).toBeCloseTo(0.12);
    expect(cameraFacingHoverTilt({ y: 0, z: 5 }, 0.12)).toBe(0);
    expect(cameraFacingHoverTilt({ y: 1, z: 5 }, 0)).toBe(0);
  });

  it("opens flat props by an exact angle from the camera-side edge", () => {
    const angle = Math.PI / 3;

    expect(cameraSideHoverTilt({ z: 5 }, angle)).toBe(angle);
    expect(cameraSideHoverTilt({ z: -5 }, angle)).toBe(-angle);
    expect(cameraSideHoverTilt({ z: 5 }, 0)).toBe(0);
  });

  it("hinges a backward tilt from the rear so the front rises", () => {
    const front = new THREE.Vector3(0, -1, 0.5);
    const rear = new THREE.Vector3(0, -1, -0.5);
    const hinge = {
      positiveTiltPivot: front,
      negativeTiltPivot: rear,
      size: 1,
      reason: null,
      swingHeight: 0.06,
      depth: 0.24,
      headroom: Number.POSITIVE_INFINITY,
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
