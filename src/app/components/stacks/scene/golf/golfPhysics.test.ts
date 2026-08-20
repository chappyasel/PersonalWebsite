import { describe, expect, it } from "vitest";

import { GOLF_CUP } from "./golfCourse";
import {
  GOLF_GRAVITY,
  GolfFixedStepper,
  type GolfWorld,
  beginGolfBallReset,
  createGolfBallState,
  launchGolfBall,
  stepGolfWorld,
} from "./golfPhysics";
import { seededGolfRandom } from "./golfShotBag";
import { planGolfTrajectory } from "./golfTrajectory";

const flatWorld = (): GolfWorld => ({
  surfaceAt: () => ({
    height: 0,
    normal: { x: 0, y: 1, z: 0 },
    surface: "green",
  }),
  cup: { x: 0, y: 0, z: -10 },
  flagstick: { x: 0, z: -10, radius: 0.018, height: 1.5 },
});

describe("fixed-step golf physics", () => {
  it("uses Earth gravity in metre-scaled scene units", () => {
    expect(GOLF_GRAVITY).toBe(9.81);
  });

  it("takes two visible turf bounces before settling into a roll", () => {
    const world = flatWorld();
    const start = { x: 0.8, y: 0.05, z: 0 };
    for (const outcome of ["ordinary-green", "hole-bound"] as const) {
      const trajectory = planGolfTrajectory(
        start,
        world.cup,
        outcome,
        seededGolfRandom(9),
        () => 0,
      );
      const ball = createGolfBallState("one", start);
      launchGolfBall(ball, trajectory.velocity, outcome);
      let airborneRebounds = 0;
      let previousImpacts = 0;
      for (let step = 0; step < 1200 && ball.phase !== "roll"; step += 1) {
        stepGolfWorld([ball], world, 1 / 120);
        if (ball.impacts > previousImpacts && ball.phase === "bounce") {
          airborneRebounds += 1;
        }
        previousImpacts = ball.impacts;
      }
      expect(airborneRebounds, outcome).toBe(
        outcome === "hole-bound" ? 1 : 2,
      );
      expect(ball.phase).toBe("roll");
    }
  });

  it("reaches a clearly visible wedge apex under Earth gravity", () => {
    const world = flatWorld();
    const start = { x: 0.8, y: 0.05, z: 0 };
    const trajectory = planGolfTrajectory(
      start,
      world.cup,
      "ordinary-green",
      seededGolfRandom(9),
      () => 0,
    );
    const ball = createGolfBallState("one", start);
    launchGolfBall(ball, trajectory.velocity, "ordinary-green");
    let apex = start.y;
    while (ball.impacts === 0) {
      stepGolfWorld([ball], world, 1 / 120);
      apex = Math.max(apex, ball.position.y);
    }
    expect(apex - start.y).toBeGreaterThan(4.2);
  });

  it("lands comparably at 30, 60 and 120 Hz", () => {
    const run = (fps: number) => {
      const world = flatWorld();
      const start = { x: 0, y: 0.05, z: 0 };
      const trajectory = planGolfTrajectory(
        start,
        world.cup,
        "ordinary-green",
        seededGolfRandom(9),
        () => 0,
      );
      const ball = createGolfBallState("one", start);
      launchGolfBall(ball, trajectory.velocity, "ordinary-green");
      const stepper = new GolfFixedStepper();
      for (let frame = 0; frame < fps * 3; frame += 1) {
        stepper.advance(1 / fps, (dt) => stepGolfWorld([ball], world, dt));
      }
      return ball.position;
    };
    const positions = [30, 60, 120].map(run);
    expect(
      Math.max(...positions.map((p) => p.x)) -
        Math.min(...positions.map((p) => p.x)),
    ).toBeLessThan(0.02);
    expect(
      Math.max(...positions.map((p) => p.z)) -
        Math.min(...positions.map((p) => p.z)),
    ).toBeLessThan(0.02);
  });

  it("captures a real rolling ball at the cup", () => {
    let cupEvents = 0;
    const world: GolfWorld = {
      ...flatWorld(),
      emit: (event) => {
        if (event.type === "cup") cupEvents += 1;
      },
    };
    const a = createGolfBallState("one", { x: 0.09, y: 0.05, z: -9.78 });
    launchGolfBall(a, { x: 0, y: 0, z: -0.35 }, "hole-bound");
    a.phase = "roll";
    // Read the phase through a call so control-flow analysis does not keep
    // the narrowing from the assignment above: stepGolfWorld mutates it, and
    // TypeScript cannot see a write made through a function.
    const phaseOf = () => a.phase;
    for (let step = 0; step < 240 && phaseOf() !== "cup"; step += 1) {
      stepGolfWorld([a], world, 1 / 120);
    }

    expect(a.holed).toBe(true);
    expect(a.position.y).toBeCloseTo(world.cup.y + a.radius, 5);
    expect(a.velocity.z).toBeLessThan(-0.1);
    expect(cupEvents).toBe(0);

    stepGolfWorld([a], world, 1 / 120);
    expect(a.position.y).toBeLessThan(world.cup.y + a.radius);
    expect(cupEvents).toBe(0);
    for (let i = 0; i < 239; i += 1) stepGolfWorld([a], world, 1 / 120);
    expect(cupEvents).toBe(1);
    expect(a.position.y).toBeCloseTo(
      world.cup.y - GOLF_CUP.depth + a.radius,
      5,
    );
  });

  it("requires five uninterrupted still seconds and fades through reset", () => {
    const world = flatWorld();
    const ball = createGolfBallState("one", { x: 0, y: 0.05, z: 0 });
    launchGolfBall(ball, { x: 0, y: 0, z: 0 }, "ordinary-green");
    ball.phase = "roll";
    for (let i = 0; i < 599; i += 1) stepGolfWorld([ball], world, 1 / 120);
    expect(ball.phase).not.toBe("fading-out");
    stepGolfWorld([ball], world, 1 / 120);
    expect(ball.phase).toBe("fading-out");
    for (let i = 0; i < 90; i += 1) stepGolfWorld([ball], world, 1 / 120);
    expect(["resetting", "fading-in", "ready"]).toContain(ball.phase);
    beginGolfBallReset(ball);
  });

  it("resets the stillness clock on movement and enforces the escape timeout", () => {
    const world = flatWorld();
    const ball = createGolfBallState("one", { x: 0, y: 0.05, z: 0 });
    launchGolfBall(ball, { x: 0, y: 0, z: 0 }, "ordinary-green");
    ball.phase = "roll";
    for (let i = 0; i < 480; i += 1) stepGolfWorld([ball], world, 1 / 120);
    ball.velocity.x = 0.4;
    stepGolfWorld([ball], world, 1 / 120);
    expect(ball.stillFor).toBe(0);
    ball.age = 19.999;
    stepGolfWorld([ball], world, 1 / 120);
    expect(ball.phase).toBe("fading-out");
  });

  it("resolves equal-mass ball contact and caps background catch-up", () => {
    const world = flatWorld();
    const a = createGolfBallState("one", { x: -0.04, y: 0.05, z: -3 });
    const b = createGolfBallState("two", { x: 0.04, y: 0.05, z: -3 });
    launchGolfBall(a, { x: 0.5, y: 0, z: 0 }, "ordinary-green");
    launchGolfBall(b, { x: -0.5, y: 0, z: 0 }, "ordinary-green");
    a.phase = "roll";
    b.phase = "roll";
    stepGolfWorld([a, b], world, 1 / 120);
    expect(a.velocity.x).toBeLessThan(0);
    expect(b.velocity.x).toBeGreaterThan(0);

    const stepper = new GolfFixedStepper();
    let steps = 0;
    stepper.advance(5, () => steps++);
    expect(steps).toBeLessThanOrEqual(15);
  });
});
