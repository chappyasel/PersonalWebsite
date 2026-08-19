import { describe, expect, it } from "vitest";

import {
  LANDING_TIMING,
  compileInsectLandingPlan,
  landingNoise,
  pointerDisturbanceIsConfirmed,
} from "./insectLanding";
import { BUTTERFLY_PILOT_PROFILE } from "./insectPilot";

describe("insect landing cadence", () => {
  it("keeps the owner-approved rest and flight ranges", () => {
    // Retuned for the OUTCOME the ranges exist to produce: two to three
    // butterflies settled on the shelf in view. Three residents per Unit at a
    // 12-25 s rest against a 15-30 s flight gap averaged about one.
    expect(LANDING_TIMING.butterflyRest).toEqual([20, 40]);
    expect(LANDING_TIMING.mothRest).toEqual([2, 6]);
    expect(LANDING_TIMING.flight).toEqual([4, 11]);
    // Rest must dominate the cycle, not punctuate it.
    const restMean =
      (LANDING_TIMING.butterflyRest[0] + LANDING_TIMING.butterflyRest[1]) / 2;
    const flightMean =
      (LANDING_TIMING.flight[0] + LANDING_TIMING.flight[1]) / 2;
    expect(restMean).toBeGreaterThan(flightMean * 3);
    expect(LANDING_TIMING.retryBackoff).toEqual([3, 5]);
  });

  it("returns stable, bounded staggering without shared random state", () => {
    const first = Array.from({ length: 12 }, (_, index) =>
      landingNoise(index, 17),
    );
    const second = Array.from({ length: 12 }, (_, index) =>
      landingNoise(index, 17),
    );
    expect(second).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe("pointer disturbance", () => {
  it("requires recent non-touch activity, confirmed proximity, and phase distance", () => {
    const base = {
      pointerType: "mouse",
      recentActivity: true,
      phase: "rest" as const,
      distancePx: 45,
      nearFor: 0.1,
      confirmation: 0.08,
    };
    expect(pointerDisturbanceIsConfirmed(base)).toBe(true);
    expect(
      pointerDisturbanceIsConfirmed({ ...base, recentActivity: false }),
    ).toBe(false);
    expect(
      pointerDisturbanceIsConfirmed({ ...base, pointerType: "touch" }),
    ).toBe(false);
    expect(pointerDisturbanceIsConfirmed({ ...base, nearFor: 0.03 })).toBe(
      false,
    );
    expect(pointerDisturbanceIsConfirmed({ ...base, distancePx: 90 })).toBe(
      false,
    );
    expect(
      pointerDisturbanceIsConfirmed({
        ...base,
        phase: "approach",
        distancePx: 90,
      }),
    ).toBe(true);
  });
});

describe("complete Landing Plan", () => {
  const request = () => ({
    perchId: "test:perch",
    collisionRevision: 9,
    start: {
      position: { x: -0.8, y: 0.45, z: -0.7 },
      velocity: { x: 0.35, y: 0.02, z: 0.15 },
      acceleration: { x: 0, y: 0, z: 0 },
    },
    target: {
      id: "test:perch",
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 0, y: 0, z: 1 },
      clearance: 0.022,
    },
    rejoin: {
      position: { x: -0.8, y: 0.45, z: -0.7 },
      velocity: { x: 0.35, y: 0.02, z: 0.15 },
      acceleration: { x: 0, y: 0, z: 0 },
    },
    profile: BUTTERFLY_PILOT_PROFILE,
  });

  it("compiles all phases and a velocity-matched frozen rejoin", () => {
    const phases: string[] = [];
    const result = compileInsectLandingPlan({
      ...request(),
      sweep: (phase) => {
        phases.push(phase);
        return true;
      },
    });
    if (!result.ok) throw new Error(result.rejectionCode);
    expect(result.plan.collisionRevision).toBe(9);
    expect(result.plan.approach.length).toBeGreaterThan(10);
    expect(result.plan.hover.length).toBeGreaterThan(2);
    expect(result.plan.touchdown.length).toBeGreaterThan(2);
    expect(result.plan.launch).toHaveLength(3);
    expect(result.plan.rejoin.length).toBeGreaterThan(10);
    expect(result.plan.rejoin.at(-1)).toEqual(request().rejoin.position);
    expect(result.plan.rejoinVelocity).toEqual(request().rejoin.velocity);
    expect(new Set(phases)).toEqual(
      new Set(["approach", "hover", "touchdown", "launch", "rejoin"]),
    );
  });

  it("emits approach, hover, and touchdown as one continuous Arrival Curve", () => {
    const result = compileInsectLandingPlan({
      ...request(),
      sweep: () => true,
    });
    if (!result.ok) throw new Error(result.rejectionCode);
    const plan = result.plan;

    // Contiguous slices share their boundary point objects, so there is no
    // seam at which the descent could be discontinuous.
    expect(plan.approach.at(-1)).toBe(plan.hover[0]);
    expect(plan.hover.at(-1)).toBe(plan.touchdown[0]);
    expect(plan.touchdown.at(-1)).toBe(plan.contact);
    expect(plan.touchdown.at(-1)).toBe(plan.launch[0]);

    // Height decreases monotonically and radius shrinks with it: this is a
    // spiral, not a circle followed by a drop.
    const descent = [
      ...plan.approach.slice(12),
      ...plan.hover,
      ...plan.touchdown,
    ];
    for (let index = 1; index < descent.length; index++)
      expect(descent[index]!.y).toBeLessThanOrEqual(
        descent[index - 1]!.y + 1e-9,
      );
    const radius = (point: { x: number; z: number }) =>
      Math.hypot(point.x - plan.contact.x, point.z - plan.contact.z);
    expect(radius(plan.hover[0]!)).toBeGreaterThan(radius(plan.touchdown[0]!));
    expect(radius(plan.touchdown.at(-1)!)).toBeLessThan(0.005);

    // And it goes around: more than a full turn of bearing change.
    let wound = 0;
    for (let index = 1; index < descent.length; index++) {
      const previous = descent[index - 1]!;
      const current = descent[index]!;
      const delta =
        Math.atan2(current.z - plan.contact.z, current.x - plan.contact.x) -
        Math.atan2(previous.z - plan.contact.z, previous.x - plan.contact.x);
      wound += Math.abs(((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    }
    expect(wound).toBeGreaterThan(Math.PI * 2);
  });

  it("meets a horizontal Perch along the surface rather than descending onto it", () => {
    const result = compileInsectLandingPlan({
      ...request(),
      sweep: () => true,
    });
    if (!result.ok) throw new Error(result.rejectionCode);
    const plan = result.plan;

    // The authored arrival angle, and the geometry that actually results.
    expect(plan.arrivalAngle).toBeLessThan(0.61); // 35 degrees
    expect(plan.arrivalAngle).toBeGreaterThan(0.05);
    const last = plan.touchdown.at(-1)!;
    const previous = plan.touchdown.at(-2)!;
    const drop = previous.y - last.y;
    const along = Math.hypot(last.x - previous.x, last.z - previous.z);
    expect(Math.atan2(drop, along)).toBeLessThan(0.61);
  });

  it("lifts folded before beginning the full-envelope launch", () => {
    const foldedSegments: Array<{
      phase: string;
      from: { x: number; y: number; z: number };
      to: { x: number; y: number; z: number };
    }> = [];
    const fullLaunchStarts: Array<{ x: number; y: number; z: number }> = [];
    const result = compileInsectLandingPlan({
      ...request(),
      foldedSweep: (phase, from, to) => {
        foldedSegments.push({ phase, from: { ...from }, to: { ...to } });
        return true;
      },
      sweep: (phase, from) => {
        if (phase === "launch") fullLaunchStarts.push({ ...from });
        return true;
      },
    });
    if (!result.ok) throw new Error(result.rejectionCode);
    expect(result.plan.launch).toHaveLength(3);
    expect(result.plan.launchFoldedThrough).toBe(1);
    expect(foldedSegments.some(({ phase }) => phase === "launch")).toBe(true);
    expect(fullLaunchStarts[0]).toEqual(result.plan.launch[1]);
    expect(fullLaunchStarts).not.toContainEqual(result.plan.contact);
  });

  it("tries a shallow outward launch when overhead geometry blocks a steep ascent", () => {
    const result = compileInsectLandingPlan({
      ...request(),
      foldedSweep: () => true,
      sweep: (phase, _from, to) => phase !== "launch" || to.y < 0.2,
    });
    if (!result.ok) throw new Error(result.rejectionCode);
    expect(result.plan.launch.at(-1)!.y).toBeLessThan(0.2);
    expect(
      Math.hypot(
        result.plan.launch.at(-1)!.x - result.plan.contact.x,
        result.plan.launch.at(-1)!.z - result.plan.contact.z,
      ),
    ).toBeGreaterThan(0.25);
  });

  it("rejects the whole candidate when its inspection arc is blocked", () => {
    const result = compileInsectLandingPlan({
      ...request(),
      sweep: (phase) => phase !== "hover",
    });
    expect(result).toEqual({ ok: false, rejectionCode: "hover-blocked" });
  });

  it("compiles no rejoin for a steering resident", () => {
    const phases: string[] = [];
    const result = compileInsectLandingPlan({
      ...request(),
      rejoin: null,
      sweep: (phase) => {
        phases.push(phase);
        return true;
      },
    });
    if (!result.ok) throw new Error(result.rejectionCode);
    expect(result.plan.rejoin).toEqual([]);
    expect(result.plan.rejoinVelocity).toEqual({ x: 0, y: 0, z: 0 });
    // And nothing was swept for a phase that does not exist, so a blocked
    // connector back to an analytic flight can no longer reject a landing.
    expect(phases).not.toContain("rejoin");
  });
});
