import { GOLF_BALL_RADIUS } from "../units/trainingGolfBall";
import { describe, expect, it } from "vitest";

import {
  GOLF_CLUB_ADDRESS_GAP,
  golfClubContactPoint,
  golfClubFaceNormal,
  golfClubHeadClearance,
  golfClubHintRotation,
  golfClubIdleBlend,
  golfClubPointerFollowRequested,
  golfClubPose,
} from "./golfClubRig";
import { GOLF_BALL_STARTS, GOLF_CLUB_MODEL_YAW } from "./golfLayout";
import {
  GOLF_COMPLETE_AT,
  GOLF_IMPACT_AT,
  GOLF_STRIKE_TIMING,
  type GolfStrikeSnapshot,
} from "./golfStrikeQueue";

const cup = { x: -1.55, y: -1, z: -17.2 };

function strike(
  stage: GolfStrikeSnapshot["stage"],
  elapsed: number,
): GolfStrikeSnapshot {
  return { current: "one", queued: [], stage, elapsed };
}

describe("grip-pivoted golf club rig", () => {
  it("uses a small grip-pivoted address lean as its interaction hint", () => {
    const still = golfClubHintRotation(0);
    expect(still.x).toBeCloseTo(0);
    expect(still.y).toBeCloseTo(0);
    expect(still.z).toBeCloseTo(0);
    expect(still.lift).toBeCloseTo(0);
    const hint = golfClubHintRotation(1);
    expect(Math.abs(hint.x)).toBeLessThan(0.05);
    expect(hint.y).toBeCloseTo((8 * Math.PI) / 180);
    expect(hint.z).toBeCloseTo(0);
    expect(hint.lift).toBeCloseTo(0.028);
  });

  it("follows the pointer within a ball-safe idle envelope", () => {
    const rest = golfClubPose(
      { current: null, queued: [], stage: "idle", elapsed: 0 },
      null,
      cup,
    );
    const clearances: number[] = [];
    for (const pointerX of [-1, 0, 1]) {
      for (const pointerY of [-1, 0, 1]) {
        const hint = golfClubHintRotation(1, pointerX, pointerY);
        const hinted = {
          position: { ...rest.position, y: rest.position.y + hint.lift },
          rotation: {
            x: rest.rotation.x + hint.x,
            y: rest.rotation.y + hint.y,
            z: rest.rotation.z + hint.z,
          },
          shaftTwist: rest.shaftTwist,
        };
        for (const ball of Object.values(GOLF_BALL_STARTS))
          clearances.push(golfClubHeadClearance(hinted, ball));
      }
    }
    expect(Math.min(...clearances)).toBeGreaterThan(0.08);
  });

  it("moves the visible clubhead in the pointer's direction", () => {
    const rest = golfClubPose(
      { current: null, queued: [], stage: "idle", elapsed: 0 },
      null,
      cup,
    );
    const headAt = (pointerX: number, pointerY: number) => {
      const hint = golfClubHintRotation(1, pointerX, pointerY);
      return golfClubContactPoint({
        position: { ...rest.position, y: rest.position.y + hint.lift },
        rotation: {
          x: rest.rotation.x + hint.x,
          y: rest.rotation.y + hint.y,
          z: rest.rotation.z + hint.z,
        },
        shaftTwist: rest.shaftTwist,
      });
    };

    expect(headAt(1, 0).x).toBeGreaterThan(headAt(-1, 0).x);
    expect(headAt(0, 1).y).toBeGreaterThan(headAt(0, -1).y);
  });

  it("blends the pointer pose out before the backswing", () => {
    expect(
      golfClubIdleBlend({
        current: null,
        queued: [],
        stage: "idle",
        elapsed: 0,
      }),
    ).toBe(1);
    expect(golfClubIdleBlend(strike("address", 0))).toBe(1);
    expect(
      golfClubIdleBlend(strike("address", GOLF_STRIKE_TIMING.address)),
    ).toBe(0);
    expect(
      golfClubIdleBlend(
        strike("backswing", GOLF_STRIKE_TIMING.address + 0.001),
      ),
    ).toBe(0);
  });

  it("tracks the whole pointer field whenever Golf is idle and focused", () => {
    const idle = {
      current: null,
      queued: [],
      stage: "idle",
      elapsed: 0,
    } satisfies GolfStrikeSnapshot;
    expect(golfClubPointerFollowRequested(true, idle)).toBe(true);
    expect(golfClubPointerFollowRequested(false, idle)).toBe(false);
    expect(golfClubPointerFollowRequested(true, strike("address", 0))).toBe(
      false,
    );
  });
  it("places the measured clubface against the near surface of the ball", () => {
    const ball = GOLF_BALL_STARTS.one;
    const pose = golfClubPose(strike("recovery", GOLF_IMPACT_AT), ball, cup);
    const contact = golfClubContactPoint(pose);
    expect(
      Math.hypot(contact.x - ball.x, contact.y - ball.y, contact.z - ball.z),
    ).toBeGreaterThanOrEqual(GOLF_BALL_RADIUS);
    expect(golfClubHeadClearance(pose, ball)).toBeCloseTo(0, 6);
    expect(pose.rotation.x).toBeCloseTo((7 * Math.PI) / 180, 8);
    expect(pose.rotation.z).toBeCloseTo((12 * Math.PI) / 180, 8);
  });

  it("presents the striking face—not the back of the iron—toward the cup", () => {
    expect(GOLF_CLUB_MODEL_YAW).toBeCloseTo(-Math.PI / 2, 8);
    const ball = GOLF_BALL_STARTS.one;
    const pose = golfClubPose(strike("recovery", GOLF_IMPACT_AT), ball, cup);
    const face = golfClubFaceNormal(pose);
    const dx = cup.x - ball.x;
    const dz = cup.z - ball.z;
    const length = Math.hypot(dx, dz);
    const horizontalFaceLength = Math.hypot(face.x, face.z);
    expect(
      (face.x / horizontalFaceLength) * (dx / length) +
        (face.z / horizontalFaceLength) * (dz / length),
    ).toBeGreaterThan(0.999);
  });

  it("moves the head through a tilted swing plane around a small hand arc", () => {
    const ball = GOLF_BALL_STARTS.one;
    const address = golfClubPose(
      strike("backswing", GOLF_STRIKE_TIMING.address),
      ball,
      cup,
    );
    const back = golfClubPose(
      strike(
        "backswing",
        GOLF_STRIKE_TIMING.address + GOLF_STRIKE_TIMING.backswing,
      ),
      ball,
      cup,
    );
    const addressHead = golfClubContactPoint(address);
    const backHead = golfClubContactPoint(back);
    expect(back.position.x).toBeCloseTo(address.position.x, 8);
    expect(back.position.z).toBeCloseTo(address.position.z, 8);
    expect(back.position.y - address.position.y).toBeCloseTo(0.055, 8);
    expect(Math.abs(backHead.y - addressHead.y)).toBeGreaterThan(0.5);
    expect(Math.abs(backHead.z - addressHead.z)).toBeGreaterThan(0.5);
    expect(back.rotation.z).toBeCloseTo((12 * Math.PI) / 180, 8);
    expect(Math.abs(backHead.x - addressHead.x)).toBeGreaterThan(0.05);
  });

  it("keeps the iron head out of the ball throughout the backswing", () => {
    const ball = GOLF_BALL_STARTS.one;
    const clearances = Array.from({ length: 21 }, (_, index) => {
      const amount = index / 20;
      const pose = golfClubPose(
        strike(
          "backswing",
          GOLF_STRIKE_TIMING.address + GOLF_STRIKE_TIMING.backswing * amount,
        ),
        ball,
        cup,
      );
      return golfClubHeadClearance(pose, ball);
    });

    expect(clearances[0]).toBeCloseTo(GOLF_CLUB_ADDRESS_GAP, 6);
    expect(Math.min(...clearances)).toBeGreaterThanOrEqual(-1e-6);
  });

  it("accelerates the clubhead into impact and carries speed through it", () => {
    const ball = GOLF_BALL_STARTS.one;
    const downswingAt = (amount: number) =>
      golfClubContactPoint(
        golfClubPose(
          strike(
            "downswing",
            GOLF_STRIKE_TIMING.address +
              GOLF_STRIKE_TIMING.backswing +
              GOLF_STRIKE_TIMING.downswing * amount,
          ),
          ball,
          cup,
        ),
      );
    const distance = (a: ReturnType<typeof downswingAt>, b: typeof a) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const early = distance(downswingAt(0), downswingAt(0.25));
    const late = distance(downswingAt(0.75), downswingAt(1));
    expect(late).toBeGreaterThan(early * 2);

    const step = 0.001;
    const before = golfClubContactPoint(
      golfClubPose(strike("downswing", GOLF_IMPACT_AT - step), ball, cup),
    );
    const impact = golfClubContactPoint(
      golfClubPose(strike("recovery", GOLF_IMPACT_AT), ball, cup),
    );
    const after = golfClubContactPoint(
      golfClubPose(strike("recovery", GOLF_IMPACT_AT + step), ball, cup),
    );
    const incomingSpeed = distance(before, impact) / step;
    const outgoingSpeed = distance(impact, after) / step;
    expect(outgoingSpeed / incomingSpeed).toBeGreaterThan(0.85);
    expect(outgoingSpeed / incomingSpeed).toBeLessThan(1.15);
  });

  it("squares the face before the swing and unwinds only during recovery", () => {
    const ball = GOLF_BALL_STARTS.one;
    const addressStart = golfClubPose(strike("address", 0), ball, cup);
    const addressEnd = golfClubPose(
      strike("address", GOLF_STRIKE_TIMING.address),
      ball,
      cup,
    );
    const backswing = golfClubPose(
      strike(
        "backswing",
        GOLF_STRIKE_TIMING.address + GOLF_STRIKE_TIMING.backswing,
      ),
      ball,
      cup,
    );
    const impact = golfClubPose(strike("downswing", GOLF_IMPACT_AT), ball, cup);
    const recoveryEnd = golfClubPose(
      strike("recovery", GOLF_COMPLETE_AT),
      ball,
      cup,
    );
    expect(addressStart.shaftTwist).toBeCloseTo(0, 8);
    expect(addressEnd.shaftTwist).toBeCloseTo(Math.PI, 8);
    expect(backswing.shaftTwist).toBeCloseTo(Math.PI, 8);
    expect(impact.shaftTwist).toBeCloseTo(Math.PI, 8);
    expect(recoveryEnd.shaftTwist).toBeCloseTo(0, 8);
  });
});
