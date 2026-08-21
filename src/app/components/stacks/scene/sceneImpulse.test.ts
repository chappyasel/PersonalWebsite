import { beforeEach, describe, expect, it } from "vitest";

import {
  SCENE_IMPULSE_SKY_DURATION,
  applySceneImpulseKick,
  createSceneImpulseMotion,
  getSceneImpulse,
  publishSceneImpulse,
  resetSceneImpulse,
  sceneImpulseInsectDeparture,
  sceneImpulseKick,
  sceneImpulseLightScale,
  sceneImpulseSkyScale,
  sceneImpulseStrengthAt,
  stepSceneImpulseMotion,
} from "./sceneImpulse";

describe("scene impulse bridge", () => {
  beforeEach(() => resetSceneImpulse());

  it("publishes one bounded Coordination shockwave", () => {
    const before = getSceneImpulse().revision;
    publishSceneImpulse({
      sourceId: "grab:coordination-research:about",
      x: 2,
      y: 0.5,
      z: -0.2,
      radius: 1.4,
      strength: 3,
      palette: "coordination",
    });

    expect(getSceneImpulse()).toMatchObject({
      sourceId: "grab:coordination-research:about",
      x: 2,
      y: 0.5,
      z: -0.2,
      radius: 1.4,
      strength: 2,
      palette: "coordination",
      revision: before + 1,
    });
  });

  it("kicks nearby props outward, skips the source, and settles exactly", () => {
    publishSceneImpulse({
      sourceId: "source",
      x: 0,
      y: 0,
      z: 0,
      radius: 2,
      strength: 1,
      palette: "coordination",
    });
    const event = getSceneImpulse();
    const kick = sceneImpulseKick(event, { x: 0.5, y: 0, z: 0 }, "neighbor");

    expect(kick.x).toBeGreaterThan(0);
    expect(kick.y).toBeGreaterThan(0);
    expect(sceneImpulseKick(event, { x: 3, y: 0, z: 0 }, "far")).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
    expect(sceneImpulseKick(event, { x: 0.5, y: 0, z: 0 }, "source")).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });

    const motion = createSceneImpulseMotion();
    applySceneImpulseKick(motion, kick);
    for (let frame = 0; frame < 300; frame += 1)
      stepSceneImpulseMotion(motion, 1 / 60);
    expect(motion).toEqual({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  });

  it("doubles the physical kick when an authored effect uses strength two", () => {
    const point = { x: 0.5, y: 0, z: 0 };
    const ordinary = sceneImpulseKick(
      {
        sourceId: "source",
        x: 0,
        y: 0,
        z: 0,
        radius: 2,
        strength: 1,
        palette: "coordination",
        revision: 1,
      },
      point,
      "neighbor",
    );
    const doubled = sceneImpulseKick(
      {
        sourceId: "source",
        x: 0,
        y: 0,
        z: 0,
        radius: 2,
        strength: 2,
        palette: "coordination",
        revision: 2,
      },
      point,
      "neighbor",
    );

    expect(doubled.x).toBeCloseTo(ordinary.x * 2);
    expect(doubled.y).toBeCloseTo(ordinary.y * 2);
    expect(doubled.z).toBeCloseTo(ordinary.z * 2);
  });

  it("knocks every held insect away from the source, even beyond the prop radius", () => {
    publishSceneImpulse({
      sourceId: "source",
      x: 1,
      y: 0.5,
      z: -1,
      radius: 0.25,
      strength: 2,
      palette: "coordination",
    });
    const departure = { x: 0, y: 0, z: 0 };

    expect(
      sceneImpulseInsectDeparture(
        getSceneImpulse(),
        { x: 4, y: 1.5, z: -1 },
        "butterfly:3",
        departure,
      ),
    ).toBe(true);
    expect(departure.x).toBeGreaterThan(0);
    expect(departure.y).toBeGreaterThan(0);
    expect(departure.z).toBeCloseTo(0);
  });

  it("drives a local blackout, irregular flicker, and full recovery", () => {
    publishSceneImpulse({
      sourceId: "source",
      x: 0,
      y: 0,
      z: 0,
      radius: 2,
      strength: 1,
      palette: "coordination",
    });
    const event = getSceneImpulse();
    const near = sceneImpulseStrengthAt(event, { x: 0.25, y: 0, z: 0 });

    expect(near).toBeGreaterThan(0.8);
    expect(sceneImpulseStrengthAt(event, { x: 3, y: 0, z: 0 })).toBe(0);
    expect(sceneImpulseLightScale(0.03, near)).toBeLessThan(0.1);
    expect(sceneImpulseLightScale(0.11, near)).toBeGreaterThan(0.7);
    expect(sceneImpulseLightScale(0.18, near)).toBeLessThan(0.2);
    expect(sceneImpulseLightScale(0.28, near)).toBeGreaterThan(0.8);
    expect(sceneImpulseLightScale(0.38, near)).toBeLessThan(0.25);
    expect(sceneImpulseLightScale(2, near)).toBe(1);
  });

  it("turns a Coordination shockwave into a global sky blackout and flash", () => {
    expect(sceneImpulseSkyScale(0.02, 1)).toBeLessThan(0.15);
    expect(sceneImpulseSkyScale(0.07, 1)).toBeGreaterThan(1.4);
    expect(sceneImpulseSkyScale(0.12, 1)).toBeLessThan(0.25);
    expect(sceneImpulseSkyScale(0.19, 1)).toBeGreaterThan(1.25);
    expect(sceneImpulseSkyScale(SCENE_IMPULSE_SKY_DURATION, 1)).toBe(1);
    expect(sceneImpulseSkyScale(0.02, 0)).toBe(1);
  });
});
