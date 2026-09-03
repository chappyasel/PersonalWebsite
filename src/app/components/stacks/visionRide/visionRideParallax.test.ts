import { describe, expect, it } from "vitest";

import { VISION_RIDE_CAMERA } from "./visionRideCamera";
import {
  VISION_RIDE_PARALLAX,
  ambientSway,
  chaseAimX,
  normalizedPointer,
  parallaxTarget,
  pointerParallax,
} from "./visionRideParallax";
import { VISION_RIDE_ROAD_HALF_WIDTH } from "./visionRideTerrain";

const {
  maxX,
  maxY,
  convexZ,
  portraitInputScale,
  portraitSwayScale,
  portraitSwayTimeScale,
  swayX,
  swayY,
  aimShare,
} = VISION_RIDE_PARALLAX;

describe("Vision ride parallax", () => {
  it("is exactly neutral at a centered pointer", () => {
    expect(pointerParallax(0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("normalises window pointer coordinates the way fiber does, y up", () => {
    expect(normalizedPointer(640, 360, 1280, 720)).toEqual({ x: 0, y: 0 });
    expect(normalizedPointer(1280, 0, 1280, 720)).toEqual({ x: 1, y: 1 });
    expect(normalizedPointer(0, 720, 1280, 720)).toEqual({ x: -1, y: -1 });
    expect(normalizedPointer(-40, 900, 1280, 720)).toEqual({ x: -1, y: -1 });
    expect(normalizedPointer(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("trucks about 17° across the road, vanishing point one way and car the other", () => {
    const cam = VISION_RIDE_CAMERA;
    const chase = cam.chaseZ - cam.carZ;
    const degrees = (angle: number) => (angle * 180) / Math.PI;
    // The eye stays over the road at the extreme.
    expect(maxX).toBeLessThan(VISION_RIDE_ROAD_HALF_WIDTH);
    expect(degrees(Math.atan2(maxX, chase))).toBeGreaterThan(15);
    expect(degrees(Math.atan2(maxX, chase))).toBeLessThan(19);
    // With the aim sharing part of the shift, the vanishing point ends up
    // about 12° off centre and the car drifts a few degrees the other way,
    // rather than the car staying pinned while the world orbits it.
    expect(aimShare).toBeGreaterThan(0);
    expect(aimShare).toBeLessThan(1);
    const aimX = chaseAimX(maxX);
    expect(aimX).toBeCloseTo(maxX * aimShare, 9);
    const yaw = Math.atan2(maxX - aimX, chase);
    const carOffCentre = Math.atan2(maxX, chase) - yaw;
    expect(degrees(yaw)).toBeGreaterThan(10);
    expect(degrees(yaw)).toBeLessThan(14);
    expect(degrees(carOffCentre)).toBeGreaterThan(3);
    expect(degrees(carOffCentre)).toBeLessThan(7);
    // y and the convex pull stay proportionate to the lateral reach.
    expect(maxY / maxX).toBeGreaterThan(0.25);
    expect(maxY / maxX).toBeLessThan(0.35);
    expect(convexZ / maxX).toBeGreaterThan(0.2);
    expect(convexZ / maxX).toBeLessThan(0.35);
  });

  it("bounds the extremes and clamps out-of-range pointers", () => {
    for (const [px, py] of [
      [1, 1],
      [-1, 1],
      [3, -8],
      [-2.5, 0.4],
    ] as const) {
      const offset = pointerParallax(px, py);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(maxX);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(maxY);
      expect(Math.abs(offset.z)).toBeLessThanOrEqual(convexZ);
    }
    expect(pointerParallax(3, 0).x).toBe(maxX);
  });

  it("pulls convexly toward the car, quadratically in radius", () => {
    const center = pointerParallax(0, 0).z;
    const half = pointerParallax(0.5, 0).z;
    const full = pointerParallax(1, 0).z;
    expect(center).toBe(0);
    expect(half).toBeLessThan(0);
    expect(full).toBeLessThan(half);
    // Quadratic: quarter the offset at half the radius.
    expect(half).toBeCloseTo(full / 4, 6);
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
  });

  it("keeps portrait steering controlled while giving idle sway more life", () => {
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
    expect(portrait.x).toBeCloseTo(
      pointer.x * portraitInputScale + portraitSway.x * portraitSwayScale,
      6,
    );
    expect(portrait.y).toBeCloseTo(
      pointer.y * portraitInputScale + portraitSway.y * portraitSwayScale,
      6,
    );
    expect(portrait.z).toBeCloseTo(pointer.z * portraitInputScale, 6);
    expect(Math.abs(portrait.x - landscape.x)).toBeGreaterThan(0.01);

    let portraitIdlePeak = 0;
    for (let t = 0; t < 20; t += 0.25) {
      const idle = parallaxTarget({
        pointerX: 0,
        pointerY: 0,
        time: t,
        portrait: true,
        reducedMotion: false,
      });
      portraitIdlePeak = Math.max(portraitIdlePeak, Math.abs(idle.x));
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
      ).toEqual({ x: 0, y: 0, z: 0 });
    }
  });
});
