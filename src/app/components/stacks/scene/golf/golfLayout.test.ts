import { describe, expect, it } from "vitest";

import {
  GOLF_BALL_IDS,
  GOLF_BALL_STARTS,
  GOLF_CLUB_HEAD_MODEL_BOUNDS,
  GOLF_CLUB_REST_BASE,
  GOLF_TEES_INTERACTIVE,
  GOLF_TEE_STARTS,
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

  it("moves the bay toward weightlifting and lays silent tees in front", () => {
    const ballXs = GOLF_BALL_IDS.map((id) => GOLF_BALL_STARTS[id].x);
    const centre =
      [
        ...ballXs,
        ...GOLF_TEE_STARTS.map(([x]) => x),
        GOLF_CLUB_REST_BASE.x,
      ].reduce((sum, x) => sum + x, 0) /
      (ballXs.length + GOLF_TEE_STARTS.length + 1);
    expect(centre).toBeGreaterThan(-2.2);
    expect(
      ballXs.reduce((sum, x) => sum + x, 0) / ballXs.length,
    ).toBeGreaterThan(-2.2);
    expect(GOLF_CLUB_REST_BASE.x).toBeGreaterThan(-2.7);
    expect(Math.min(...GOLF_TEE_STARTS.map(([, z]) => z))).toBeGreaterThan(
      Math.max(...GOLF_BALL_IDS.map((id) => GOLF_BALL_STARTS[id].z)) + 0.1,
    );
    expect(GOLF_TEES_INTERACTIVE).toBe(false);
  });
});
