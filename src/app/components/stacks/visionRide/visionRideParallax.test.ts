import { describe, expect, it } from "vitest";

import { VISION_RIDE_CAMERA, chaseFraming } from "./visionRideCamera";
import {
  VISION_RIDE_PARALLAX,
  ambientSway,
  chaseAimX,
  normalizedPointer,
  parallaxTarget,
  pointerParallax,
  swingPath,
} from "./visionRideParallax";
import { VISION_RIDE_ROAD_HALF_WIDTH } from "./visionRideTerrain";

const {
  wallX,
  swingDegrees,
  maxY,
  portraitInputScale,
  portraitSwayScale,
  portraitSwayTimeScale,
  swayX,
  swayY,
  aimShare,
} = VISION_RIDE_PARALLAX;

describe("Vision ride parallax", () => {
  it("is exactly neutral at a centered pointer", () => {
    expect(pointerParallax(0, 0)).toEqual({ swing: 0, y: 0 });
  });

  it("normalises window pointer coordinates the way fiber does, y up", () => {
    expect(normalizedPointer(640, 360, 1280, 720)).toEqual({ x: 0, y: 0 });
    expect(normalizedPointer(1280, 0, 1280, 720)).toEqual({ x: 1, y: 1 });
    expect(normalizedPointer(0, 720, 1280, 720)).toEqual({ x: -1, y: -1 });
    expect(normalizedPointer(-40, 900, 1280, 720)).toEqual({ x: -1, y: -1 });
    expect(normalizedPointer(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("swings to a rear three-quarter view over the road, aim sharing part of it", () => {
    const cam = VISION_RIDE_CAMERA;
    const framing = chaseFraming(false);
    const anchorDistance = framing.chaseDistance + cam.carLengthMetres / 2;
    const degrees = (angle: number) => (angle * 180) / Math.PI;
    // The eye stays over the road at the extreme, well inside the shoulder
    // the ridge feet can cross.
    expect(wallX).toBeLessThan(VISION_RIDE_ROAD_HALF_WIDTH - 0.5);
    expect(swingDegrees).toBe(45);
    const end = swingPath(anchorDistance, 1);
    expect(end.x).toBe(wallX);
    expect(degrees(Math.atan2(end.x, end.zRel))).toBeCloseTo(45, 9);
    // Mid-swing the aim shares part of the offset, so the vanishing point
    // slides one way and the car drifts a few degrees the other rather
    // than staying pinned while the world orbits it; at the end the aim is
    // on the car, which is what lets the bumper's far corner stay in a
    // 16:9 frame from beside it.
    expect(aimShare).toBeGreaterThan(0);
    expect(aimShare).toBeLessThan(1);
    const mid = swingPath(anchorDistance, 0.5);
    expect(degrees(Math.atan2(mid.x, mid.zRel))).toBeCloseTo(22.5, 9);
    const midAim = chaseAimX(mid.x, 0.5);
    expect(midAim).toBeCloseTo(mid.x * aimShare * 0.75, 9);
    const midYaw = Math.atan2(mid.x - midAim, mid.zRel);
    const midOffCentre = Math.atan2(mid.x, mid.zRel) - midYaw;
    expect(degrees(midOffCentre)).toBeGreaterThan(2);
    expect(degrees(midOffCentre)).toBeLessThan(6);
    expect(chaseAimX(end.x, 1)).toBe(0);
    expect(chaseAimX(end.x, 4)).toBe(0);
    expect(chaseAimX(0, 0.5)).toBe(0);
    expect(
      degrees(Math.atan2(end.x - chaseAimX(end.x, 1), end.zRel)),
    ).toBeCloseTo(45, 9);
    // The lift stays proportionate.
    expect(maxY / wallX).toBeGreaterThan(0.15);
    expect(maxY / wallX).toBeLessThan(0.25);
  });

  it("bounds the extremes and clamps out-of-range pointers", () => {
    for (const [px, py] of [
      [1, 1],
      [-1, 1],
      [3, -8],
      [-2.5, 0.4],
    ] as const) {
      const offset = pointerParallax(px, py);
      expect(Math.abs(offset.swing)).toBeLessThanOrEqual(1);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(maxY);
    }
    expect(pointerParallax(3, 0).swing).toBe(1);
    expect(pointerParallax(0, -3).y).toBe(-maxY);
  });

  it("pulls the eye forward parabolically, walked by angle", () => {
    const anchorDistance = 7;
    const centre = swingPath(anchorDistance, 0);
    const half = swingPath(anchorDistance, 0.5);
    const full = swingPath(anchorDistance, 1);
    expect(centre.zRel).toBe(anchorDistance);
    expect(half.zRel).toBeLessThan(anchorDistance);
    expect(full.zRel).toBeLessThan(half.zRel);
    // The shape is the parabola z = D - k x^2 through the end point, and
    // the walk is by angle: half the swing is half the end angle, which
    // on this path is most of the lateral travel and half the pull.
    const k = (anchorDistance - full.zRel) / (full.x * full.x);
    for (const s of [0.25, 0.5, 0.75, 1]) {
      const at = swingPath(anchorDistance, s);
      expect(at.zRel).toBeCloseTo(anchorDistance - k * at.x * at.x, 9);
      expect(Math.atan2(at.x, at.zRel)).toBeCloseTo((s * Math.PI) / 4, 9);
    }
    expect(half.x / full.x).toBeGreaterThan(0.6);
    expect(half.x / full.x).toBeLessThan(0.8);
    expect(
      (anchorDistance - half.zRel) / (anchorDistance - full.zRel),
    ).toBeGreaterThan(0.4);
    expect(
      (anchorDistance - half.zRel) / (anchorDistance - full.zRel),
    ).toBeLessThan(0.6);
    // Nearer than the wall's circle, the path is an arc on the anchor's
    // own distance and the pull is what the arc needs.
    const near = swingPath(3, 1);
    expect(near.x).toBeCloseTo(3 * Math.SQRT1_2, 9);
    expect(near.zRel).toBeCloseTo(3 * Math.SQRT1_2, 9);
  });

  it("keeps the ambient sway small, alive, and loop-free at scale", () => {
    let moved = false;
    for (let t = 0; t < 60; t += 1.7) {
      const sway = ambientSway(t);
      expect(Math.abs(sway.x)).toBeLessThanOrEqual(swayX);
      expect(Math.abs(sway.y)).toBeLessThanOrEqual(swayY);
      if (Math.abs(sway.x) > 0.01 || Math.abs(sway.y) > 0.005) moved = true;
    }
    expect(moved).toBe(true);
    // Sway is a small fraction of the swing, so the rest pose reads still.
    expect(swayX).toBeLessThan(0.1);
  });

  it("gives portrait the whole swing (the frame cap limits it) and more idle sway", () => {
    const time = 12.3;
    const landscape = parallaxTarget({
      pointerX: 0.8,
      pointerY: -0.6,
      time,
      portrait: false,
      reducedMotion: false,
    });
    const portrait = parallaxTarget({
      pointerX: 0.8,
      pointerY: -0.6,
      time,
      portrait: true,
      reducedMotion: false,
    });
    const pointer = pointerParallax(0.8, -0.6);
    const portraitSway = ambientSway(time * portraitSwayTimeScale);
    expect(portraitInputScale).toBe(1);
    expect(portrait.swing).toBeCloseTo(
      pointer.swing * portraitInputScale + portraitSway.x * portraitSwayScale,
      6,
    );
    expect(portrait.y).toBeCloseTo(
      pointer.y * portraitInputScale + portraitSway.y * portraitSwayScale,
      6,
    );
    expect(Math.abs(portrait.swing - landscape.swing)).toBeGreaterThan(0.001);
    // The wall is the wall: sway on top of a full pointer never exceeds it.
    for (let t = 0; t < 40; t += 0.5) {
      for (const portraitFrame of [false, true]) {
        const full = parallaxTarget({
          pointerX: 1,
          pointerY: 1,
          time: t,
          portrait: portraitFrame,
          reducedMotion: false,
        });
        expect(Math.abs(full.swing)).toBeLessThanOrEqual(1);
      }
    }
    let portraitIdlePeak = 0;
    for (let t = 0; t < 20; t += 0.25) {
      const idle = parallaxTarget({
        pointerX: 0,
        pointerY: 0,
        time: t,
        portrait: true,
        reducedMotion: false,
      });
      portraitIdlePeak = Math.max(portraitIdlePeak, Math.abs(idle.swing));
    }
    expect(portraitIdlePeak).toBeGreaterThan(swayX);
  });

  it("is identically zero under reduced motion", () => {
    for (const t of [0, 3.7, 41.2]) {
      expect(
        parallaxTarget({
          pointerX: 1,
          pointerY: -1,
          time: t,
          portrait: false,
          reducedMotion: true,
        }),
      ).toEqual({ swing: 0, y: 0 });
    }
  });
});
