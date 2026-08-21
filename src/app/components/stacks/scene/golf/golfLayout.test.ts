import { SHELF_GEOMETRY } from "../shelfGeometry";
import { GOLF_BALL_RADIUS } from "../units/trainingGolfBall";
import { describe, expect, it } from "vitest";

import {
  GOLF_BALL_IDS,
  GOLF_BALL_STARTS,
  GOLF_BALL_UNTEED_START,
  GOLF_CLUB_HEAD_MODEL_BOUNDS,
  GOLF_CLUB_REST_BASE,
  GOLF_TEES_INTERACTIVE,
  GOLF_TEE_LAYOUT,
  GOLF_TEE_MODEL_HEIGHT,
  GOLF_TEE_VISIBLE_HEIGHT,
  golfClubContactBeforeModelYaw,
} from "./golfLayout";

describe("authored golf bay composition", () => {
  it("spreads the balls without overlapping their enlarged tap targets", () => {
    const distances: number[] = [];
    for (let a = 0; a < GOLF_BALL_IDS.length; a += 1)
      for (let b = a + 1; b < GOLF_BALL_IDS.length; b += 1) {
        const first = GOLF_BALL_STARTS[GOLF_BALL_IDS[a]!];
        const second = GOLF_BALL_STARTS[GOLF_BALL_IDS[b]!];
        distances.push(Math.hypot(first.x - second.x, first.z - second.z));
      }
    expect(Math.min(...distances)).toBeGreaterThan(0.5);
  });

  it("keeps the measured impact point inside the actual GLB clubhead", () => {
    const contact = golfClubContactBeforeModelYaw();
    expect(contact.x).toBeGreaterThanOrEqual(GOLF_CLUB_HEAD_MODEL_BOUNDS.x[0]);
    expect(contact.x).toBeLessThanOrEqual(GOLF_CLUB_HEAD_MODEL_BOUNDS.x[1]);
    expect(contact.y).toBeGreaterThanOrEqual(GOLF_CLUB_HEAD_MODEL_BOUNDS.y[0]);
    expect(contact.y).toBeLessThanOrEqual(GOLF_CLUB_HEAD_MODEL_BOUNDS.y[1]);
    expect(contact.z).toBeGreaterThanOrEqual(GOLF_CLUB_HEAD_MODEL_BOUNDS.z[0]);
    expect(contact.z).toBeLessThanOrEqual(GOLF_CLUB_HEAD_MODEL_BOUNDS.z[1]);
  });

  it("moves the bay toward weightlifting", () => {
    const ballXs = GOLF_BALL_IDS.map((id) => GOLF_BALL_STARTS[id].x);
    const centre =
      [
        ...ballXs,
        ...GOLF_TEE_LAYOUT.map((tee) => tee.position[0]),
        GOLF_CLUB_REST_BASE.x,
      ].reduce((sum, x) => sum + x, 0) /
      (ballXs.length + GOLF_TEE_LAYOUT.length + 1);
    expect(centre).toBeGreaterThan(-2.2);
    expect(
      ballXs.reduce((sum, x) => sum + x, 0) / ballXs.length,
    ).toBeGreaterThan(-2.2);
    expect(GOLF_CLUB_REST_BASE.x).toBeCloseTo(-2.9);
    expect(GOLF_CLUB_REST_BASE.y).toBeCloseTo(SHELF_GEOMETRY.groundY);
    expect(GOLF_CLUB_REST_BASE.z).toBeCloseTo(0.02);
  });

  it("rests the first ball on a planted tee and keeps all three draggable", () => {
    const stand = GOLF_TEE_LAYOUT.find((tee) => tee.id === "stand")!;
    const spares = GOLF_TEE_LAYOUT.filter((tee) => tee.id !== "stand");

    expect(stand.position[0]).toBe(GOLF_BALL_STARTS.one.x);
    expect(stand.position[2]).toBe(GOLF_BALL_STARTS.one.z);
    expect(GOLF_BALL_STARTS.one.y - GOLF_BALL_RADIUS).toBeCloseTo(
      stand.position[1] + stand.modelPosition[1] + GOLF_TEE_MODEL_HEIGHT,
    );
    expect(spares).toHaveLength(2);
    expect(spares.every((tee) => tee.rotation[0] === Math.PI / 2)).toBe(true);
    expect(GOLF_TEE_LAYOUT.every((tee) => tee.draggable)).toBe(true);
    expect(GOLF_BALL_UNTEED_START.y).toBeCloseTo(
      SHELF_GEOMETRY.groundY + GOLF_BALL_RADIUS,
    );
    expect(
      Math.hypot(
        GOLF_BALL_UNTEED_START.x - GOLF_BALL_STARTS.one.x,
        GOLF_BALL_UNTEED_START.z - GOLF_BALL_STARTS.one.z,
      ),
    ).toBeGreaterThan(GOLF_BALL_RADIUS * 2);
    expect(GOLF_TEE_VISIBLE_HEIGHT).toBeLessThan(GOLF_BALL_RADIUS);
    expect(new Set(GOLF_TEE_LAYOUT.map((tee) => tee.tint))).toEqual(
      new Set(["#f2ede2"]),
    );
    expect(GOLF_TEES_INTERACTIVE).toBe(true);
  });
});
