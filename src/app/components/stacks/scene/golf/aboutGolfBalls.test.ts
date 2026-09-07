import { ABOUT_LANDMARK_X, ABOUT_LOWER_LANDMARK_Z } from "../aboutScenePose";
import { SHELF_GEOMETRY } from "../shelfGeometry";
import { GOLF_BALL_RADIUS } from "../units/trainingGolfBall";
import { describe, expect, it } from "vitest";

import { ABOUT_GOLF_BALLS, isAboutGolfBallKey } from "./aboutGolfBalls";

describe("About golf balls", () => {
  it("uses two stable origin keys without claiming the Training shelf balls", () => {
    expect(ABOUT_GOLF_BALLS.map((ball) => ball.id)).toEqual([
      "about-a",
      "about-b",
    ]);
    expect(isAboutGolfBallKey("golf-ball:about-a")).toBe(true);
    expect(isAboutGolfBallKey("golf-ball:about-b")).toBe(true);
    expect(isAboutGolfBallKey("golf-ball:shelf-a")).toBe(false);
  });

  it("tucks both ground balls under the shelf's left side in front of the lamp", () => {
    const floorHalfWidth = SHELF_GEOMETRY.floor.width / 2;
    const floorHalfDepth = SHELF_GEOMETRY.floor.depth / 2;
    const floorFront = SHELF_GEOMETRY.floor.centerZ + floorHalfDepth;
    const floorBack = SHELF_GEOMETRY.floor.centerZ - floorHalfDepth;
    const lowerShelfFront =
      SHELF_GEOMETRY.lower.centerZ + SHELF_GEOMETRY.lower.depth / 2;
    const topShelfFront =
      SHELF_GEOMETRY.top.centerZ + SHELF_GEOMETRY.top.depth / 2;

    for (const ball of ABOUT_GOLF_BALLS) {
      const [x, y, z] = ball.base;
      expect(Math.abs(x) + GOLF_BALL_RADIUS).toBeLessThan(floorHalfWidth);
      expect(z + GOLF_BALL_RADIUS).toBeLessThanOrEqual(floorFront);
      expect(z - GOLF_BALL_RADIUS).toBeGreaterThanOrEqual(floorBack);
      expect(x).toBeLessThan(0);
      expect(z + GOLF_BALL_RADIUS).toBeLessThanOrEqual(topShelfFront);
      expect(z).toBeGreaterThan(ABOUT_LOWER_LANDMARK_Z["desk-lamp"]);
      expect(x).toBeGreaterThan(ABOUT_LANDMARK_X["desk-lamp"]);
      expect(Math.abs(y - SHELF_GEOMETRY.groundY)).toBeLessThan(
        GOLF_BALL_RADIUS,
      );
    }

    expect(ABOUT_GOLF_BALLS[0].base[2]).toBeLessThan(
      ABOUT_GOLF_BALLS[1].base[2],
    );
    expect(ABOUT_GOLF_BALLS[0].base[2] + GOLF_BALL_RADIUS).toBeLessThan(
      lowerShelfFront,
    );
    expect(ABOUT_GOLF_BALLS[1].base[2] - GOLF_BALL_RADIUS).toBeGreaterThan(
      lowerShelfFront,
    );
    expect(ABOUT_GOLF_BALLS[0].yaw).toBeCloseTo(0.65 - 0.2731, 4);
    expect(
      Math.hypot(
        ABOUT_GOLF_BALLS[0].base[0] - ABOUT_GOLF_BALLS[1].base[0],
        ABOUT_GOLF_BALLS[0].base[2] - ABOUT_GOLF_BALLS[1].base[2],
      ),
    ).toBeGreaterThan(GOLF_BALL_RADIUS * 2);
  });
});
