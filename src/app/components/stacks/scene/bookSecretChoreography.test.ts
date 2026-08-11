import { describe, expect, it } from "vitest";

import {
  beginBookSecretPull,
  bookSecretChoreography,
  bookSecretRenderScore,
  bookSecretSnapshot,
  commitsBookSecretReturnTap,
  releaseBookSecretPull,
  resetBookSecret,
  setBookSecretPull,
  setBookSecretReducedMotion,
  tickBookSecret,
} from "./bookSecret";
import { SHELF_GEOMETRY } from "./shelfGeometry";

describe("book secret visual choreography", () => {
  it("stages a physical unlock, room reveal, and camera arrival", () => {
    const closed = bookSecretChoreography(0);
    const unlock = bookSecretChoreography(0.08);
    const reveal = bookSecretChoreography(0.42);
    const arrival = bookSecretChoreography(0.78);
    const open = bookSecretChoreography(1);

    expect(closed).toMatchObject({
      door: 0,
      threshold: 0,
      room: 0,
      arrival: 0,
    });
    expect(unlock.door).toBeGreaterThan(0);
    expect(unlock.room).toBe(0);
    expect(reveal.threshold).toBeGreaterThan(0);
    expect(reveal.room).toBeGreaterThan(0);
    expect(reveal.room).toBeLessThan(1);
    expect(reveal.arrival).toBe(0);
    expect(arrival.arrival).toBeGreaterThan(0);
    expect(open).toMatchObject({
      door: 1,
      threshold: 1,
      room: 1,
      arrival: 1,
    });
  });

  it("has no binary pop anywhere on the reveal timeline", () => {
    const samples = Array.from({ length: 101 }, (_, index) =>
      bookSecretChoreography(index / 100),
    );

    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1]!;
      const current = samples[index]!;
      for (const channel of ["door", "threshold", "room", "arrival"] as const) {
        expect(current[channel]).toBeGreaterThanOrEqual(previous[channel]);
        expect(current[channel] - previous[channel]).toBeLessThan(0.09);
      }
    }
  });

  it("keeps every numeric render output below a six-percent frame delta", () => {
    const samples = Array.from({ length: 104 }, (_, index) =>
      bookSecretRenderScore(index / 103, false),
    );
    const ranges = {
      doorAngle: Math.PI * 0.485,
      thresholdZ: 0.43,
      thresholdOpacity: 1,
      roomZ: 0.65,
      roomOpacity: 1,
      shelfOpacity: 1,
      keyLight: 5.07,
      fillLight: 5.4,
      dustOpacity: 0.48,
    } as const;

    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1]!;
      const current = samples[index]!;
      for (const channel of Object.keys(ranges) as Array<keyof typeof ranges>) {
        expect(Math.abs(current[channel] - previous[channel])).toBeLessThan(
          ranges[channel] * 0.06,
        );
      }
    }

    const closing = Array.from({ length: 104 }, (_, index) =>
      bookSecretRenderScore(1 - index / 103, false),
    );
    const reversed = [...samples].reverse();
    for (let index = 0; index < closing.length; index += 1) {
      for (const channel of Object.keys(ranges) as Array<keyof typeof ranges>) {
        expect(closing[index]![channel]).toBeCloseTo(
          reversed[index]![channel],
          12,
        );
      }
    }
  });

  it("spends the full duration on visible beats instead of an exponential tail", () => {
    resetBookSecret();
    beginBookSecretPull("open");
    setBookSecretPull(1);
    releaseBookSecretPull(true);

    for (let frame = 0; frame < 30; frame += 1) tickBookSecret(1 / 60);
    expect(bookSecretSnapshot()).toMatchObject({ phase: "opening" });
    expect(bookSecretSnapshot().progress).toBeLessThan(0.35);

    for (let frame = 0; frame < 74; frame += 1) tickBookSecret(1 / 60);
    expect(bookSecretSnapshot()).toMatchObject({ phase: "open", progress: 1 });
  });

  it("crossfades the actual surfaces in place for reduced motion", () => {
    resetBookSecret();
    setBookSecretReducedMotion(true);
    beginBookSecretPull("open");
    setBookSecretPull(1);
    releaseBookSecretPull(true);
    tickBookSecret(1 / 60);

    expect(bookSecretSnapshot()).toMatchObject({ phase: "open", progress: 1 });
    expect(bookSecretSnapshot().visualProgress).toBeGreaterThan(0);
    expect(bookSecretSnapshot().visualProgress).toBeLessThan(0.5);

    for (let frame = 0; frame < 20; frame += 1) tickBookSecret(1 / 60);
    expect(bookSecretSnapshot().visualProgress).toBe(1);

    const beforeMid = bookSecretRenderScore(0.49, true);
    const afterMid = bookSecretRenderScore(0.51, true);
    expect(beforeMid.doorAngle).toBe(0);
    expect(afterMid.doorAngle).toBe(0);
    expect(beforeMid.roomZ).toBe(0);
    expect(afterMid.roomZ).toBe(0);
    expect(afterMid.roomOpacity - beforeMid.roomOpacity).toBeLessThan(0.05);
    expect(beforeMid.shelfOpacity + beforeMid.roomOpacity).toBeCloseTo(1, 12);
    expect(afterMid.shelfOpacity + afterMid.roomOpacity).toBeCloseTo(1, 12);
    expect(bookSecretRenderScore(1, true).shelfVisible).toBe(false);
    expect(bookSecretRenderScore(0.5, true)).not.toHaveProperty(
      "curtainOpacity",
    );

    setBookSecretReducedMotion(false);
    resetBookSecret();
  });

  it("keeps the hinged case inside its own unit bay for the full sweep", () => {
    const hingeX = -SHELF_GEOMETRY.width / 2 - 0.04;
    const centreFromHinge = -hingeX;
    // Includes the 0.85m shelf plus front-rank covers and pull travel.
    const conservativeHalfDepth = 0.7;
    const bayHalfWidth = 2.2;

    for (let step = 0; step <= 100; step += 1) {
      const door = bookSecretChoreography(step / 100).door;
      const angle = -Math.PI * 0.485 * door;
      const xs = [-conservativeHalfDepth, conservativeHalfDepth].flatMap((z) =>
        [-SHELF_GEOMETRY.width / 2, SHELF_GEOMETRY.width / 2].map(
          (x) => hingeX + Math.cos(angle) * (x - hingeX) + Math.sin(angle) * z,
        ),
      );
      expect(Math.min(...xs)).toBeGreaterThan(-bayHalfWidth);
      expect(Math.max(...xs)).toBeLessThan(bayHalfWidth);
      expect(centreFromHinge).toBeGreaterThan(0);
    }
  });

  it("commits a claimed return tap without re-projecting a settling target", () => {
    expect(
      commitsBookSecretReturnTap({ x: 334, y: 503 }, { x: 334, y: 503 }),
    ).toBe(true);
    expect(
      commitsBookSecretReturnTap({ x: 334, y: 503 }, { x: 341, y: 503 }),
    ).toBe(false);
    expect(commitsBookSecretReturnTap(null, { x: 334, y: 503 })).toBe(false);
  });
});
