import { SHELF_GEOMETRY } from "../shelfGeometry";

import { GOLF_BALL_MASS_KG } from "./GolfBallProp";
import { GOLF_GRAVITY } from "./golfPhysics";
import type { GolfVec3 } from "./golfTypes";

/** Launch a loose prop toward the cup, with lighter props carrying farther. */
export function planLoosePropLaunch(
  position: GolfVec3,
  cup: GolfVec3,
  massKg: number,
  contactHeight: number,
  random: () => number = Math.random,
): GolfVec3 {
  const toCup = {
    x: cup.x - position.x,
    z: cup.z - position.z,
  };
  const cupDistance = Math.max(0.001, Math.hypot(toCup.x, toCup.z));
  const scatter = (random() - 0.5) * 0.24;
  const dir = {
    x:
      (toCup.x / cupDistance) * Math.cos(scatter) -
      (toCup.z / cupDistance) * Math.sin(scatter),
    z:
      (toCup.x / cupDistance) * Math.sin(scatter) +
      (toCup.z / cupDistance) * Math.cos(scatter),
  };
  const massFactor = Math.min(
    1,
    Math.max(0.55, Math.sqrt(GOLF_BALL_MASS_KG / massKg) * 1.4),
  );
  // A full swing carries a tennis ball most of the way to the green. Keep
  // the heavier props shorter, without capping every hit at a 7 m chip.
  const carry = Math.min(14, Math.max(3.5, cupDistance * 0.76 * massFactor));
  const flightTime = 0.9 + carry / 14;
  const landingY = SHELF_GEOMETRY.groundY + contactHeight;
  return {
    x: (dir.x * carry) / flightTime,
    y:
      (landingY - position.y + 0.5 * GOLF_GRAVITY * flightTime * flightTime) /
      flightTime,
    z: (dir.z * carry) / flightTime,
  };
}
