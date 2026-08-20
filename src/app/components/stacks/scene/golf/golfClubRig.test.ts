import { describe, expect, it } from "vitest";

import {
  golfClubContactPoint,
  golfClubFaceNormal,
  golfClubHintRotation,
  golfClubPose,
} from "./golfClubRig";
import { GOLF_BALL_STARTS } from "./golfLayout";
import { GOLF_CLUB_MODEL_YAW } from "./golfLayout";
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
    expect(hint.y).toBeCloseTo(Math.PI / 9);
    expect(hint.z).toBe(0);
    expect(hint.lift).toBeCloseTo(0.06);
  });
  it("places the measured clubhead contact point on the selected ball", () => {
    const ball = GOLF_BALL_STARTS.one;
    const pose = golfClubPose(strike("recovery", GOLF_IMPACT_AT), ball, cup);
    const contact = golfClubContactPoint(pose);
    expect(contact.x).toBeCloseTo(ball.x, 6);
    expect(contact.y).toBeCloseTo(ball.y, 6);
    expect(contact.z).toBeCloseTo(ball.z, 6);
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
