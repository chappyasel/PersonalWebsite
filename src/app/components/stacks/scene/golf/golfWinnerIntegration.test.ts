import { meadowHeight } from "../meadowField";
import { unitPose } from "../worldLayout";
import { describe, expect, it } from "vitest";

import { GOLF_FLAG_LOCAL, golfSurfaceAt } from "./golfCourse";
import { GOLF_BALL_STARTS } from "./golfLayout";
import {
  GolfFixedStepper,
  type GolfWorld,
  createGolfBallState,
  launchGolfBall,
  stepGolfWorld,
} from "./golfPhysics";
import { seededGolfRandom } from "./golfShotBag";
import { planGolfTrajectory } from "./golfTrajectory";
import type {
  GolfBallId,
  GolfBallPhase,
  GolfShotOutcome,
  GolfSurface,
  GolfVec3,
} from "./golfTypes";

function actualTrainingWorld() {
  const pose = unitPose(2);
  const yaw = pose.rotation[1];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const toWorld = (point: GolfVec3) => ({
    x: pose.position[0] + point.x * c + point.z * s,
    y: point.y,
    z: pose.position[2] - point.x * s + point.z * c,
  });
  const cupWorld = toWorld({
    x: GOLF_FLAG_LOCAL[0],
    y: 0,
    z: GOLF_FLAG_LOCAL[1],
  });
  const cup = {
    x: GOLF_FLAG_LOCAL[0],
    y: meadowHeight(cupWorld.x, cupWorld.z),
    z: GOLF_FLAG_LOCAL[1],
  };
  const surfaceAt: GolfWorld["surfaceAt"] = (x, z) => {
    const world = toWorld({ x, y: 0, z });
    const e = 0.03;
    const dx =
      (meadowHeight(world.x + e, world.z) -
        meadowHeight(world.x - e, world.z)) /
      (2 * e);
    const dz =
      (meadowHeight(world.x, world.z + e) -
        meadowHeight(world.x, world.z - e)) /
      (2 * e);
    const length = Math.hypot(dx, 1, dz);
    const normal = { x: -dx / length, y: 1 / length, z: -dz / length };
    return {
      height: meadowHeight(world.x, world.z),
      normal: {
        x: normal.x * c - normal.z * s,
        y: normal.y,
        z: normal.x * s + normal.z * c,
      },
      surface: golfSurfaceAt(world.x, world.z),
    };
  };
  return { cup, surfaceAt };
}

function simulateAuthoredShot(
  id: GolfBallId,
  outcome: GolfShotOutcome,
  seed: number,
  renderHz = 120,
) {
  const { cup, surfaceAt } = actualTrainingWorld();
  const ball = createGolfBallState(id, GOLF_BALL_STARTS[id]);
  const toCupX = cup.x - ball.position.x;
  const toCupZ = cup.z - ball.position.z;
  const toCupLength = Math.hypot(toCupX, toCupZ);
  const shotDirection = {
    x: toCupX / toCupLength,
    z: toCupZ / toCupLength,
  };
  const trajectory = planGolfTrajectory(
    ball.position,
    cup,
    outcome,
    seededGolfRandom(seed),
    (x, z) => surfaceAt(x, z).height,
  );
  launchGolfBall(ball, trajectory.velocity, outcome);
  let reset = false;
  let firstImpact: GolfVec3 | null = null;
  let firstImpactBeyondCup = -Infinity;
  let firstImpactVelocity: GolfVec3 | null = null;
  let firstImpactSurface: GolfSurface | null = null;
  let terminal: GolfVec3 | null = null;
  let closest = Infinity;
  let closestSpeed = Infinity;
  let closestPhase: GolfBallPhase = ball.phase;
  let closestImpacts = 0;
  let rollingClosest = Infinity;
  let rollingClosestSpeed = Infinity;
  let flagTaps = 0;
  let rolledWithinOneUnit = false;
  let backspinReversal = false;
  const world: GolfWorld = {
    surfaceAt,
    cup,
    flagstick: { x: cup.x, z: cup.z, radius: 0.01, height: 1.51 },
    emit: (event) => {
      if (event.type === "first-impact") {
        firstImpact = { ...event.position };
        firstImpactBeyondCup =
          (event.position.x - cup.x) * shotDirection.x +
          (event.position.z - cup.z) * shotDirection.z;
        firstImpactVelocity = { ...ball.velocity };
        firstImpactSurface = surfaceAt(
          event.position.x,
          event.position.z,
        ).surface;
      }
      if (event.type === "flagstick") flagTaps += 1;
      if (event.type === "reset") {
        reset = true;
        terminal = { ...ball.position };
      }
    },
  };
  const fixedStepper = new GolfFixedStepper();
  for (
    let frame = 0;
    frame < 20 * renderHz && !ball.holed && !reset;
    frame += 1
  ) {
    fixedStepper.advance(1 / renderHz, (dt) =>
      stepGolfWorld([ball], world, dt),
    );
    const cupDistance = Math.hypot(
      ball.position.x - cup.x,
      ball.position.z - cup.z,
    );
    if (ball.phase === "roll") {
      if (cupDistance < 1) rolledWithinOneUnit = true;
      if (cupDistance < rollingClosest) {
        rollingClosest = cupDistance;
        rollingClosestSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
      }
    }
    if (
      ball.impacts > 0 &&
      ball.phase !== "cup" &&
      ball.velocity.x * shotDirection.x + ball.velocity.z * shotDirection.z <
        -0.05
    )
      backspinReversal = true;
    if (cupDistance < closest) {
      closest = cupDistance;
      closestSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
      closestPhase = ball.phase;
      closestImpacts = ball.impacts;
    }
  }
  return {
    ball,
    trajectory,
    firstImpact,
    firstImpactVelocity,
    firstImpactSurface,
    terminal,
    closest,
    closestSpeed,
    closestPhase,
    closestImpacts,
    rollingClosest,
    rollingClosestSpeed,
    flagTaps,
    rolledWithinOneUnit,
    backspinReversal,
    firstImpactBeyondCup,
  };
}

describe("protected hole-bound shot on the authored Training course", () => {
  it("physically holes from every authored ball position without interference", () => {
    for (const id of Object.keys(GOLF_BALL_STARTS) as GolfBallId[]) {
      for (let seed = 0; seed < 16; seed += 1) {
        const trace = simulateAuthoredShot(id, "hole-bound", 100 + seed);
        expect(
          trace.ball.holed,
          `${id}/seed-${seed}: landing=${JSON.stringify(trace.trajectory.landing)} ` +
            `impact=${JSON.stringify(trace.firstImpact)} closest=${trace.closest.toFixed(3)} ` +
            `impactVelocity=${JSON.stringify(trace.firstImpactVelocity)} ` +
            `closestSpeed=${trace.closestSpeed.toFixed(3)} ` +
            `rolling=${trace.rollingClosest.toFixed(3)}@${trace.rollingClosestSpeed.toFixed(3)} ` +
            `closestPhase=${trace.closestPhase}/${trace.closestImpacts}impacts ` +
            `terminal=${JSON.stringify(trace.terminal)}`,
        ).toBe(true);
        expect(trace.rolledWithinOneUnit).toBe(true);
        expect(
          Math.hypot(trace.ball.velocity.x, trace.ball.velocity.z),
        ).toBeLessThan(0.34);
        expect(trace.firstImpactBeyondCup).toBeGreaterThan(0.15);
        expect(trace.backspinReversal).toBe(true);
      }
    }
  });

  it("cannot tunnel past the authored cup at 30, 60 or 120 render Hz", () => {
    for (const renderHz of [30, 60, 120]) {
      const trace = simulateAuthoredShot("three", "hole-bound", 118, renderHz);
      expect(
        trace.ball.holed,
        `${renderHz} Hz closest=${trace.closest} ` +
          `rolling=${trace.rollingClosest}@${trace.rollingClosestSpeed}`,
      ).toBe(true);
      expect(trace.rolledWithinOneUnit).toBe(true);
    }
  });

  it("keeps the production outcome families physically distinct", () => {
    const ordinary = simulateAuthoredShot("one", "ordinary-green", 21);
    const rare = simulateAuthoredShot("one", "rare-miss", 21);
    expect(ordinary.firstImpactSurface).toBe("green");
    expect(rare.firstImpactSurface).toBe("rough");
    expect(ordinary.ball.holed).toBe(false);
    expect(rare.ball.holed).toBe(false);
  });

  it("produces real lip-out, flagstick and close-roll near misses", () => {
    const lip = simulateAuthoredShot("one", "near-miss", 0);
    const flag = simulateAuthoredShot("one", "near-miss", 1);
    const close = simulateAuthoredShot("one", "near-miss", 2);
    expect(lip.trajectory.variant).toBe("lip-out");
    expect(lip.ball.holed).toBe(false);
    expect(lip.closest).toBeLessThan(0.22);
    expect(flag.trajectory.variant).toBe("flagstick");
    expect(
      flag.flagTaps,
      `flag closest=${flag.closest.toFixed(3)} phase=${flag.closestPhase} ` +
        `impact=${JSON.stringify(flag.firstImpact)} terminal=${JSON.stringify(flag.terminal)}`,
    ).toBeGreaterThan(0);
    expect(flag.ball.holed).toBe(false);
    expect(close.trajectory.variant).toBe("close-roll");
    expect(close.closest).toBeLessThan(0.38);
    expect(
      close.ball.holed,
      `close-roll landing=${JSON.stringify(close.trajectory.landing)} ` +
        `closest=${close.closest.toFixed(3)}@${close.closestSpeed.toFixed(3)} ` +
        `rolling=${close.rollingClosest.toFixed(3)}@${close.rollingClosestSpeed.toFixed(3)}`,
    ).toBe(false);
  });
});
