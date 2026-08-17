import { describe, expect, it } from "vitest";

import {
  golfClubContactPoint,
  golfClubFaceNormal,
  golfClubPose,
} from "./golfClubRig";
import { GOLF_BALL_STARTS } from "./golfLayout";
import { GOLF_CLUB_MODEL_YAW } from "./golfLayout";
import type { GolfStrikeSnapshot } from "./golfStrikeQueue";

const cup = { x: -1.55, y: -1, z: -17.2 };

function strike(
  stage: GolfStrikeSnapshot["stage"],
  elapsed: number,
): GolfStrikeSnapshot {
  return { current: "one", queued: [], stage, elapsed };
}

describe("grip-pivoted golf club rig", () => {
  it("places the measured clubhead contact point on the selected ball", () => {
    const ball = GOLF_BALL_STARTS.one;
    const pose = golfClubPose(strike("recovery", 0.35), ball, cup);
    const contact = golfClubContactPoint(pose);
    expect(contact.x).toBeCloseTo(ball.x, 6);
    expect(contact.y).toBeCloseTo(ball.y, 6);
    expect(contact.z).toBeCloseTo(ball.z, 6);
  });

  it("presents the striking face—not the back of the iron—toward the cup", () => {
    expect(GOLF_CLUB_MODEL_YAW).toBeCloseTo(-Math.PI / 2, 8);
    const ball = GOLF_BALL_STARTS.one;
    const pose = golfClubPose(strike("recovery", 0.35), ball, cup);
    const face = golfClubFaceNormal(pose);
    const dx = cup.x - ball.x;
    const dz = cup.z - ball.z;
    const length = Math.hypot(dx, dz);
    expect(face.x * (dx / length) + face.z * (dz / length)).toBeGreaterThan(
      0.999,
    );
  });

  it("moves the head through a vertical swing plane around a stable grip", () => {
    const ball = GOLF_BALL_STARTS.one;
    const address = golfClubPose(strike("backswing", 0.1), ball, cup);
    const back = golfClubPose(strike("backswing", 0.25), ball, cup);
    const addressHead = golfClubContactPoint(address);
    const backHead = golfClubContactPoint(back);
    expect(back.position).toEqual(address.position);
    expect(Math.abs(backHead.y - addressHead.y)).toBeGreaterThan(0.5);
    expect(Math.abs(backHead.z - addressHead.z)).toBeGreaterThan(0.5);
    expect(Math.abs(backHead.x - addressHead.x)).toBeLessThan(0.2);
  });

  it("squares the face before the swing and unwinds only during recovery", () => {
    const ball = GOLF_BALL_STARTS.one;
    const addressStart = golfClubPose(strike("address", 0), ball, cup);
    const addressEnd = golfClubPose(strike("address", 0.1), ball, cup);
    const backswing = golfClubPose(strike("backswing", 0.25), ball, cup);
    const impact = golfClubPose(strike("downswing", 0.35), ball, cup);
    const recoveryEnd = golfClubPose(strike("recovery", 0.5), ball, cup);
    expect(addressStart.shaftTwist).toBeCloseTo(0, 8);
    expect(addressEnd.shaftTwist).toBeCloseTo(Math.PI, 8);
    expect(backswing.shaftTwist).toBeCloseTo(Math.PI, 8);
    expect(impact.shaftTwist).toBeCloseTo(Math.PI, 8);
    expect(recoveryEnd.shaftTwist).toBeCloseTo(0, 8);
  });
});
