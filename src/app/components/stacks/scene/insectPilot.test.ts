import { describe, expect, it } from "vitest";

import {
  type InsectCollisionBox,
  insectCorridorIsClear,
  reviseInsectCollisionIndex,
} from "./insectCollision";
import {
  createInsectFlightVolume,
  createInsectFlightVolumeContainment,
} from "./insectFlightVolume";
import {
  BUTTERFLY_PILOT_PROFILE,
  type InsectFlightWorld,
  type InsectKinematicSample,
  type InsectLandingTarget,
  type InsectPilot,
  MOTH_PILOT_PROFILE,
  type PilotVector,
  advanceInsectPilot,
  commandInsectPilot,
  createInsectPilot,
  insectBodyPitchForSpeed,
  insectFlapActivation,
  insectPilotPhaseLimits,
  insectWingAmplitudeForSpeed,
  insectWingFrequencyForSpeed,
  restingIdleBob,
  restingIdleInterval,
  restingIdleOpening,
} from "./insectPilot";
import { BUTTERFLY_STEERING_PROFILE } from "./insectSteering";

type Sphere = { center: PilotVector; radius: number };

class PrimitiveFlightWorld implements InsectFlightWorld {
  readonly reservations = new Map<string, string>();
  readonly sweepRadii: number[] = [];
  readonly sphereSweeps: Array<{ from: PilotVector; to: PilotVector }> = [];
  readonly supportContactFlags: boolean[] = [];
  foldedSweeps = 0;
  fullSphereMinimumSupportY: number | null = null;
  readonly obstacles: Sphere[] = [];
  blockNextTouchdownMovement = false;
  reservationIsStale = false;
  cruiseSpeed = 0.24;
  cruiseWave = 0.16;
  compileLandingPlan?: InsectFlightWorld["compileLandingPlan"];

  sampleCruise(flightId: number, time: number, out: InsectKinematicSample) {
    const phase = time * 0.37 + flightId * 0.41;
    out.position.x =
      this.cruiseSpeed * time + this.cruiseWave * Math.sin(phase);
    out.position.y = 0.4 + 0.025 * Math.sin(time * 0.61 + flightId);
    out.position.z = 0.18 * Math.cos(time * 0.29 + flightId * 0.3);
    out.velocity.x =
      this.cruiseSpeed + this.cruiseWave * 0.37 * Math.cos(phase);
    out.velocity.y = 0.025 * 0.61 * Math.cos(time * 0.61 + flightId);
    out.velocity.z = -0.18 * 0.29 * Math.sin(time * 0.29 + flightId * 0.3);
    out.acceleration.x = -this.cruiseWave * 0.37 * 0.37 * Math.sin(phase);
    out.acceleration.y =
      -0.025 * 0.61 * 0.61 * Math.sin(time * 0.61 + flightId);
    out.acceleration.z =
      -0.18 * 0.29 * 0.29 * Math.cos(time * 0.29 + flightId * 0.3);
  }

  sweepSphere(
    from: PilotVector,
    to: PilotVector,
    radius: number,
    allowReservedSupportContact = false,
    allowPenetrationEscape = false,
  ) {
    this.sweepRadii.push(radius);
    this.sphereSweeps.push({ from: { ...from }, to: { ...to } });
    this.supportContactFlags.push(allowReservedSupportContact);
    if (
      allowReservedSupportContact &&
      this.fullSphereMinimumSupportY !== null &&
      Math.min(from.y, to.y) < this.fullSphereMinimumSupportY
    )
      return false;
    if (
      this.blockNextTouchdownMovement &&
      allowReservedSupportContact &&
      !allowPenetrationEscape
    ) {
      this.blockNextTouchdownMovement = false;
      return false;
    }
    const abX = to.x - from.x;
    const abY = to.y - from.y;
    const abZ = to.z - from.z;
    const lengthSquared = abX * abX + abY * abY + abZ * abZ;
    for (const obstacle of this.obstacles) {
      const acX = obstacle.center.x - from.x;
      const acY = obstacle.center.y - from.y;
      const acZ = obstacle.center.z - from.z;
      const projection =
        lengthSquared > 0
          ? Math.max(
              0,
              Math.min(1, (acX * abX + acY * abY + acZ * abZ) / lengthSquared),
            )
          : 0;
      const dx = from.x + abX * projection - obstacle.center.x;
      const dy = from.y + abY * projection - obstacle.center.y;
      const dz = from.z + abZ * projection - obstacle.center.z;
      if (Math.hypot(dx, dy, dz) < radius + obstacle.radius) {
        if (allowPenetrationEscape) {
          const startDistance = Math.hypot(
            from.x - obstacle.center.x,
            from.y - obstacle.center.y,
            from.z - obstacle.center.z,
          );
          const endDistance = Math.hypot(
            to.x - obstacle.center.x,
            to.y - obstacle.center.y,
            to.z - obstacle.center.z,
          );
          if (
            startDistance < radius + obstacle.radius &&
            endDistance + 1e-9 >= startDistance &&
            (from.x - obstacle.center.x) * (to.x - from.x) +
              (from.y - obstacle.center.y) * (to.y - from.y) +
              (from.z - obstacle.center.z) * (to.z - from.z) >=
              -1e-9
          )
            continue;
        }
        return false;
      }
    }
    return true;
  }

  sweepFolded(
    from: PilotVector,
    to: PilotVector,
    _normal: PilotVector,
    _tangent: PilotVector,
    allowReservedSupportContact = false,
  ) {
    this.foldedSweeps++;
    this.supportContactFlags.push(allowReservedSupportContact);
    if (this.blockNextTouchdownMovement) {
      this.blockNextTouchdownMovement = false;
      return false;
    }
    const abX = to.x - from.x;
    const abY = to.y - from.y;
    const abZ = to.z - from.z;
    const lengthSquared = abX * abX + abY * abY + abZ * abZ;
    for (const obstacle of this.obstacles) {
      const acX = obstacle.center.x - from.x;
      const acY = obstacle.center.y - from.y;
      const acZ = obstacle.center.z - from.z;
      const projection =
        lengthSquared > 0
          ? Math.max(
              0,
              Math.min(1, (acX * abX + acY * abY + acZ * abZ) / lengthSquared),
            )
          : 0;
      const dx = from.x + abX * projection - obstacle.center.x;
      const dy = from.y + abY * projection - obstacle.center.y;
      const dz = from.z + abZ * projection - obstacle.center.z;
      if (Math.hypot(dx, dy, dz) < 0.02 + obstacle.radius) return false;
    }
    return true;
  }

  tryReserve(perchId: string, occupantId: string) {
    if (this.reservationIsStale)
      return {
        ok: false,
        rejectionCode: "stale-collision-revision",
      } as const;
    const occupant = this.reservations.get(perchId);
    if (occupant && occupant !== occupantId) return false;
    this.reservations.set(perchId, occupantId);
    return true;
  }

  release(perchId: string, occupantId: string) {
    if (this.reservations.get(perchId) === occupantId)
      this.reservations.delete(perchId);
  }
}

/**
 * A world in which the reserved support is a real collider: any movement that
 * comes within `supportReach` of the contact is refused unless the caller
 * passes `allowReservedSupportContact`.
 *
 * `PrimitiveFlightWorld` never models the support this way, which is why a
 * green suite could coexist with a scene where not one butterfly landed. The
 * Arrival Curve spirals in, so its hover arc is inside that reach by design
 * and the planner validates it with the exception; the pilot then has to fly
 * it with the exception too. Every phase the planner forgives the support in
 * must be a phase the pilot flies with the same licence, and this world is the
 * only thing in the suite that can tell the difference.
 */
class SupportedFlightWorld extends PrimitiveFlightWorld {
  readonly contact = { x: 0.62, y: 0, z: 0.02 };
  readonly supportReach = 0.155;

  private clearsSupport(from: PilotVector, to: PilotVector, allow: boolean) {
    if (allow) return true;
    for (const point of [from, to])
      if (
        Math.hypot(
          point.x - this.contact.x,
          point.y - this.contact.y,
          point.z - this.contact.z,
        ) < this.supportReach
      )
        return false;
    return true;
  }

  override sweepSphere(
    from: PilotVector,
    to: PilotVector,
    radius: number,
    allowReservedSupportContact = false,
    allowPenetrationEscape = false,
  ) {
    if (!this.clearsSupport(from, to, allowReservedSupportContact))
      return false;
    return super.sweepSphere(
      from,
      to,
      radius,
      allowReservedSupportContact,
      allowPenetrationEscape,
    );
  }

  override sweepFolded(
    from: PilotVector,
    to: PilotVector,
    normal: PilotVector,
    tangent: PilotVector,
    allowReservedSupportContact = false,
  ) {
    if (!this.clearsSupport(from, to, allowReservedSupportContact))
      return false;
    return super.sweepFolded(
      from,
      to,
      normal,
      tangent,
      allowReservedSupportContact,
    );
  }
}

const ORIGIN_VOLUME = createInsectFlightVolume({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
});

const landingTarget = (id = "test:perch"): InsectLandingTarget => ({
  id,
  point: { x: 0.62, y: 0, z: 0.02 },
  normal: { x: 0, y: 1, z: 0 },
  tangent: { x: 1, y: 0, z: 0 },
  clearance: 0.1,
});

function initialSample(world: PrimitiveFlightWorld, flightId = 0) {
  const value: InsectKinematicSample = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
  };
  world.sampleCruise(flightId, 0, value);
  return value;
}

function pilot(world: PrimitiveFlightWorld, flightId = 0) {
  return createInsectPilot({
    occupantId: `butterfly:${flightId}`,
    flightId,
    seed: 41 + flightId,
    initialTime: 0,
    initial: initialSample(world, flightId),
    profile: BUTTERFLY_PILOT_PROFILE,
  });
}

function advanceUntil(
  value: InsectPilot,
  world: PrimitiveFlightWorld,
  phase: InsectPilot["phase"],
  seconds = 30,
) {
  for (let frame = 0; frame < seconds * 60; frame++) {
    advanceInsectPilot(value, 1 / 60, world);
    if (value.phase === phase) return;
  }
  throw new Error(`pilot did not reach ${phase}; stopped in ${value.phase}`);
}

describe("acceleration-limited insect pilot", () => {
  it("keeps ordinary roam on the authored analytic flight despite shelf grazes", () => {
    const world: InsectFlightWorld = {
      sampleCruise(_flightId, time, out) {
        const slowPhase = time * 0.71;
        const flapPhase = time * Math.PI * 2 * 9.3;
        out.position.x = time * 0.2;
        out.position.y =
          -0.77 + 0.08 * Math.sin(slowPhase) + 0.01 * Math.cos(flapPhase);
        out.position.z = 0;
        out.velocity.x = 0.2;
        out.velocity.y =
          0.08 * 0.71 * Math.cos(slowPhase) -
          0.01 * Math.PI * 2 * 9.3 * Math.sin(flapPhase);
        out.velocity.z = 0;
        out.acceleration.x = 0;
        out.acceleration.y =
          -0.08 * 0.71 * 0.71 * Math.sin(slowPhase) -
          0.01 * Math.pow(Math.PI * 2 * 9.3, 2) * Math.cos(flapPhase);
        out.acceleration.z = 0;
      },
      // The original butterfly paths deliberately graze shelf/prop bounds.
      // Landing corridors remain collision-checked, but reactive steering of
      // normal flight turns that harmless overlap into a vertical yo-yo.
      sweepSphere: () => false,
      tryReserve: () => true,
      release: () => undefined,
    };
    const initial: InsectKinematicSample = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
    };
    world.sampleCruise(0, 0, initial);
    const value = createInsectPilot({
      occupantId: "butterfly:analytic-roam",
      flightId: 0,
      seed: 7,
      initialTime: 0,
      initial,
      profile: BUTTERFLY_PILOT_PROFILE,
    });

    for (let frame = 0; frame < 60; frame++)
      advanceInsectPilot(value, 1 / 60, world);

    expect(value.phase).toBe("roam");
    expect(value.position.x).toBeCloseTo(value.cruise.position.x, 10);
    expect(value.position.y).toBeCloseTo(value.cruise.position.y, 10);
    expect(value.velocity.y).toBeCloseTo(value.cruise.velocity.y, 10);
  });

  it("is deterministic across 30, 60, and 120 Hz callers", () => {
    const results = [30, 60, 120].map((hz) => {
      const world = new PrimitiveFlightWorld();
      const value = pilot(world, 2);
      for (let frame = 0; frame < hz * 8; frame++)
        advanceInsectPilot(value, 1 / hz, world);
      return value;
    });
    for (const value of results.slice(1)) {
      expect(value.position.x).toBeCloseTo(results[0]!.position.x, 10);
      expect(value.position.y).toBeCloseTo(results[0]!.position.y, 10);
      expect(value.position.z).toBeCloseTo(results[0]!.position.z, 10);
      expect(value.velocity.x).toBeCloseTo(results[0]!.velocity.x, 10);
      expect(value.wingPhase).toBeCloseTo(results[0]!.wingPhase, 10);
    }
  });

  it("completes the full Landing Cycle at 30, 60, and 120 Hz within limits", () => {
    const results = [30, 60, 120].map((hz) => {
      const world = new PrimitiveFlightWorld();
      const value = pilot(world, 3);
      const phaseOrder = new Set<InsectPilot["phase"]>([value.phase]);
      const startingWingPhase = value.wingPhase;
      let departed = false;
      let maximumSpeed = 0;
      let maximumAcceleration = 0;
      let maximumJerk = 0;
      let previousAcceleration = { ...value.acceleration };
      expect(
        commandInsectPilot(
          value,
          { type: "land", target: landingTarget(`rate:${hz}`) },
          world,
        ),
      ).toBe(true);
      for (let frame = 0; frame < hz * 60; frame++) {
        advanceInsectPilot(value, 1 / hz, world);
        phaseOrder.add(value.phase);
        maximumSpeed = Math.max(
          maximumSpeed,
          Math.hypot(value.velocity.x, value.velocity.y, value.velocity.z),
        );
        maximumAcceleration = Math.max(
          maximumAcceleration,
          Math.hypot(
            value.acceleration.x,
            value.acceleration.y,
            value.acceleration.z,
          ),
        );
        maximumJerk = Math.max(
          maximumJerk,
          Math.hypot(
            value.acceleration.x - previousAcceleration.x,
            value.acceleration.y - previousAcceleration.y,
            value.acceleration.z - previousAcceleration.z,
          ) * hz,
        );
        previousAcceleration = { ...value.acceleration };
        if (value.phase === "rest" && !departed) {
          expect(commandInsectPilot(value, { type: "depart" }, world)).toBe(
            true,
          );
          departed = true;
        }
        if (departed && value.phase === "roam") break;
      }
      expect(phaseOrder).toEqual(
        new Set([
          "roam",
          "approach",
          "hover",
          "touchdown",
          "rest",
          "launch",
          "rejoin",
        ]),
      );
      expect(value.phase).toBe("roam");
      expect(world.reservations.size).toBe(0);
      expect(world.foldedSweeps).toBeGreaterThan(0);
      expect(maximumSpeed).toBeLessThanOrEqual(value.profile.maxSpeed + 1e-9);
      expect(maximumAcceleration).toBeLessThanOrEqual(
        value.profile.maxAcceleration + 1e-9,
      );
      // Rendered-frame jerk can contain several identical 120 Hz substeps;
      // the total frame delta remains bounded by maxJerk * frame duration.
      expect(maximumJerk).toBeLessThanOrEqual(value.profile.maxJerk + 1e-6);
      expect(value.wingPhase).not.toBe(startingWingPhase);
      return value;
    });
    for (const value of results.slice(1)) {
      expect(Math.abs(value.position.x - results[0]!.position.x)).toBeLessThan(
        0.04,
      );
      expect(Math.abs(value.velocity.x - results[0]!.velocity.x)).toBeLessThan(
        0.08,
      );
      expect(Number.isFinite(value.wingPhase)).toBe(true);
    }
  });

  it("lets every resident plan to its active shelf without a lucky flyby", () => {
    for (let unit = 0; unit < 7; unit++) {
      const world = new PrimitiveFlightWorld();
      const value = pilot(world, unit);
      const target = landingTarget(`unit:${unit}`);
      target.point.x = value.position.x + 0.6;
      expect(commandInsectPilot(value, { type: "land", target }, world)).toBe(
        true,
      );
      advanceUntil(value, world, "rest", 30);
      expect(value.reservedPerchId).toBe(target.id);
      commandInsectPilot(value, { type: "depart" }, world);
      advanceUntil(value, world, "rejoin", 10);
      expect(world.reservations.size).toBe(0);
    }
  });

  it("visibly folds its wings for object-top rest and the initial launch lift", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("folded-presentation") },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "rest", 30);
    for (let frame = 0; frame < 30; frame++)
      advanceInsectPilot(value, 1 / 60, world);
    expect(Math.abs(value.wingAngle)).toBeGreaterThan(1);

    expect(commandInsectPilot(value, { type: "depart" }, world)).toBe(true);
    advanceInsectPilot(value, 1 / 60, world);
    expect(value.phase).toBe("launch");
    expect(Math.abs(value.wingAngle)).toBeGreaterThan(1);
  });

  it("bounds catch-up work after a background-tab frame gap", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    const before = value.time;
    advanceInsectPilot(value, 30, world);
    expect(value.time - before).toBeCloseTo(0.1, 10);
    expect(value.accumulator).toBeLessThan(1 / 120);
    expect(
      Math.hypot(value.velocity.x, value.velocity.y, value.velocity.z),
    ).toBeLessThanOrEqual(value.profile.maxSpeed + 1e-9);
  });

  it("rejects a blocked approach using the complete wing envelope", () => {
    const world = new PrimitiveFlightWorld();
    world.obstacles.push({
      center: { x: 0.4, y: 0.37, z: 0.08 },
      radius: 0.03,
    });
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget() },
        world,
      ),
    ).toBe(false);
    expect(value.phase).toBe("roam");
    expect(value.event).toBe("approach-blocked");
    expect(world.reservations.size).toBe(0);
    expect(world.sweepRadii[0]).toBeCloseTo(
      value.profile.wingRadius + value.profile.wanderAmplitude,
    );
  });

  it("preserves the reservation adapter's exact failure reason", () => {
    const world = new PrimitiveFlightWorld();
    world.reservationIsStale = true;
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("stale-plan") },
        world,
      ),
    ).toBe(false);
    expect(value.rejectionCode).toBe("stale-collision-revision");
    expect(world.reservations.size).toBe(0);
  });

  it("uses a swept wing radius for every accepted movement", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget() },
        world,
      ),
    ).toBe(true);
    world.sweepRadii.length = 0;
    for (let frame = 0; frame < 120; frame++)
      advanceInsectPilot(value, 1 / 60, world);
    expect(world.sweepRadii.length).toBeGreaterThan(0);
    expect(
      world.sweepRadii.every(
        (radius) => radius + 1e-12 >= value.profile.wingRadius,
      ),
    ).toBe(true);
  });

  it("flies the compiled phase routes instead of only aiming at their endpoints", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    const start = { ...value.position };
    const contact = { x: 0.62, y: 0.1, z: 0.02 };
    const stage = { x: 0.65, y: 0.38, z: 0.02 };
    const hoverCenter = { x: 0.62, y: 0.28, z: 0.02 };
    const launchTarget = { x: 0.8, y: 0.45, z: 0.02 };
    world.compileLandingPlan = (request) => ({
      ok: true,
      plan: {
        perchId: request.perchId,
        collisionRevision: null,
        approach: [start, { x: 0.25, y: 0.55, z: 0.58 }, stage],
        hover: [stage, { x: 0.62, y: 0.32, z: -0.28 }, hoverCenter],
        touchdown: [hoverCenter, contact],
        launch: [contact, { x: 0.7, y: 0.35, z: -0.35 }, launchTarget],
        launchFoldedThrough: 1,
        rejoin: [
          launchTarget,
          { x: 0.45, y: 0.58, z: 0.55 },
          { ...request.rejoin!.position },
        ],
        contact,
        normal: { x: 0, y: 1, z: 0 },
        tangent: { x: 1, y: 0, z: 0 },
        rejoinVelocity: { ...request.rejoin!.velocity },
        arrivalAngle: 0.436,
      },
    });
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("planned-routes") },
        world,
      ),
    ).toBe(true);

    let maximumApproachZ = value.position.z;
    let minimumHoverZ = value.position.z;
    let minimumLaunchZ = value.position.z;
    let maximumRejoinZ = value.position.z;
    let departed = false;
    for (let frame = 0; frame < 60 * 60; frame++) {
      advanceInsectPilot(value, 1 / 60, world);
      if (value.phase === "approach")
        maximumApproachZ = Math.max(maximumApproachZ, value.position.z);
      if (value.phase === "hover")
        minimumHoverZ = Math.min(minimumHoverZ, value.position.z);
      if (value.phase === "launch")
        minimumLaunchZ = Math.min(minimumLaunchZ, value.position.z);
      if (value.phase === "rejoin")
        maximumRejoinZ = Math.max(maximumRejoinZ, value.position.z);
      if (value.phase === "rest" && !departed) {
        expect(commandInsectPilot(value, { type: "depart" }, world)).toBe(true);
        departed = true;
      }
      if (departed && value.phase === "rejoin" && maximumRejoinZ > 0.35) break;
    }

    expect(value.phase).toBe("rejoin");
    expect(maximumApproachZ).toBeGreaterThan(0.3);
    expect(minimumHoverZ).toBeLessThan(-0.12);
    // The launch follows the compiled polyline away from the contact — hence a
    // negative z — but an Escape ends on displacement, so it is not required to
    // reach the far waypoint the way the other phases reach their endpoints.
    expect(minimumLaunchZ).toBeLessThan(-0.02);
    expect(maximumRejoinZ).toBeGreaterThan(0.35);
    expect(world.reservations.size).toBe(0);
  });

  it("translates shared plan points exactly once when a perch moves", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    const originalTarget = landingTarget("moving-perch");
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: originalTarget },
        world,
      ),
    ).toBe(true);
    const plan = value.landingPlan!;
    expect(plan.hover.at(-1)).toBe(plan.touchdown[0]);
    expect(plan.touchdown.at(-1)).toBe(plan.launch[0]);
    expect(plan.contact).toBe(plan.touchdown.at(-1));

    const uniquePoints = new Set(
      [plan.approach, plan.hover, plan.touchdown, plan.launch].flat(),
    );
    uniquePoints.add(plan.contact);
    const before = new Map(
      [...uniquePoints].map((point) => [point, { ...point }] as const),
    );
    const dx = 0.23;
    const dy = -0.04;
    const dz = 0.08;
    expect(
      commandInsectPilot(
        value,
        {
          type: "update-perch",
          target: {
            ...originalTarget,
            point: {
              x: originalTarget.point.x + dx,
              y: originalTarget.point.y + dy,
              z: originalTarget.point.z + dz,
            },
          },
        },
        world,
      ),
    ).toBe(true);

    for (const point of uniquePoints) {
      const old = before.get(point)!;
      expect(point.x).toBeCloseTo(old.x + dx, 12);
      expect(point.y).toBeCloseTo(old.y + dy, 12);
      expect(point.z).toBeCloseTo(old.z + dz, 12);
    }
  });

  it("uses the bounded support licence throughout arrival and launch", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget() },
        world,
      ),
    ).toBe(true);
    expect(world.supportContactFlags.some((allowed) => allowed)).toBe(true);
    world.supportContactFlags.length = 0;
    advanceInsectPilot(value, 1 / 60, world);
    expect(world.supportContactFlags.length).toBeGreaterThan(0);
    expect(world.supportContactFlags.every((allowed) => allowed)).toBe(true);
    advanceUntil(value, world, "rest");
    expect(commandInsectPilot(value, { type: "depart" }, world)).toBe(true);
    expect(world.supportContactFlags.slice(-2)).toEqual([true, false]);
  });

  it("fails closed when a manually constructed rejoin target is occupied", () => {
    const world = new PrimitiveFlightWorld();
    world.cruiseWave = 0;
    world.obstacles.push({
      center: { x: -0.16, y: 0.4, z: 0.18 },
      radius: 0.12,
    });
    const value = pilot(world);
    value.phase = "rejoin";
    value.position.x = -0.5;
    value.velocity.x = 0;
    let maximumDetour = 0;
    for (let frame = 0; frame < 12 * 60; frame++) {
      advanceInsectPilot(value, 1 / 60, world);
      maximumDetour = Math.max(
        maximumDetour,
        Math.abs(value.position.y - value.cruise.position.y),
        Math.abs(value.position.z - value.cruise.position.z),
      );
    }
    expect(value.position.x).toBeLessThan(0.25);
    expect(maximumDetour).toBeGreaterThan(0.05);
    expect(
      Math.hypot(value.velocity.x, value.velocity.y, value.velocity.z),
    ).toBeLessThanOrEqual(value.profile.maxSpeed + 1e-9);
  });

  it("does not let a dynamic collider displace authored ordinary flight", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    world.obstacles.push({ center: { ...value.position }, radius: 0.04 });
    const before = { ...value.position };
    for (let frame = 0; frame < 6 * 60; frame++)
      advanceInsectPilot(value, 1 / 60, world);
    expect(value.phase).toBe("roam");
    expect(value.position.x).not.toBe(before.x);
    expect(value.position.x).toBeCloseTo(value.cruise.position.x, 10);
    expect(value.position.y).toBeCloseTo(value.cruise.position.y, 10);
    expect(value.position.z).toBeCloseTo(value.cruise.position.z, 10);
  });

  it("preserves position, velocity, and wing phase on a disturbed takeoff", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget() },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "rest");
    const position = { ...value.position };
    const velocity = { ...value.velocity };
    const wingPhase = value.wingPhase;
    expect(
      commandInsectPilot(
        value,
        { type: "depart", away: { x: -1, y: -0.4, z: 0.2 } },
        world,
      ),
    ).toBe(true);
    expect(value.phase).toBe("launch");
    expect(value.position).toEqual(position);
    expect(value.velocity).toEqual(velocity);
    expect(value.wingPhase).toBe(wingPhase);
    expect(value.launchDirection.y).toBeGreaterThan(0);
    const before = { ...value.position };
    // Acceleration-limited departure preserves the tiny residual contact
    // velocity instead of reversing it in one frame. It must establish travel
    // along the requested launch vector shortly afterward.
    for (let frame = 0; frame < 30; frame++)
      advanceInsectPilot(value, 1 / 60, world);
    const travel = {
      x: value.position.x - before.x,
      y: value.position.y - before.y,
      z: value.position.z - before.z,
    };
    expect(
      travel.x * value.launchDirection.x +
        travel.y * value.launchDirection.y +
        travel.z * value.launchDirection.z,
    ).toBeGreaterThan(0);
  });

  it("does not recreate the old uncapped depart-to-roam handoff", () => {
    const world = new PrimitiveFlightWorld();
    world.cruiseSpeed = 0.42;
    world.cruiseWave = 0.3;
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget() },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "rest");

    for (let frame = 0; frame < 9 * 60; frame++)
      advanceInsectPilot(value, 1 / 60, world);
    const targetDistanceAtDeparture = Math.hypot(
      value.position.x - value.cruise.position.x,
      value.position.y - value.cruise.position.y,
      value.position.z - value.cruise.position.z,
    );
    // The safe route clock is frozen during engagement, so the precompiled
    // rejoin target cannot run several world units away during a long rest.
    expect(targetDistanceAtDeparture).toBeLessThan(1);
    expect(
      commandInsectPilot(
        value,
        { type: "depart", away: { x: 0.3, y: 1, z: 0.25 } },
        world,
      ),
    ).toBe(true);

    let previousPhase = value.phase;
    let rejoined = false;
    let previousAcceleration = { ...value.acceleration };
    for (let frame = 0; frame < 60 * 45; frame++) {
      // An Escape is allowed a higher ceiling than ordinary flight, so the
      // bound is read from the phase rather than from the profile. The point of
      // the assertion is that SOME finite limit still governs every frame.
      const limits = insectPilotPhaseLimits(value);
      advanceInsectPilot(value, 1 / 60, world);
      expect(
        Math.hypot(value.velocity.x, value.velocity.y, value.velocity.z),
      ).toBeLessThanOrEqual(limits.speed + 1e-9);
      expect(
        Math.hypot(
          value.acceleration.x,
          value.acceleration.y,
          value.acceleration.z,
        ),
      ).toBeLessThanOrEqual(limits.acceleration + 1e-9);
      // Two fixed substeps occur per rendered frame. The net acceleration
      // change therefore remains bounded by jerk * rendered delta.
      expect(
        Math.hypot(
          value.acceleration.x - previousAcceleration.x,
          value.acceleration.y - previousAcceleration.y,
          value.acceleration.z - previousAcceleration.z,
        ),
      ).toBeLessThanOrEqual(limits.jerk / 60 + 1e-9);
      previousAcceleration = { ...value.acceleration };
      if (previousPhase === "rejoin" && value.phase === "roam") {
        const positionError = Math.hypot(
          value.position.x - value.cruise.position.x,
          value.position.y - value.cruise.position.y,
          value.position.z - value.cruise.position.z,
        );
        const velocityError = Math.hypot(
          value.velocity.x - value.cruise.velocity.x,
          value.velocity.y - value.cruise.velocity.y,
          value.velocity.z - value.cruise.velocity.z,
        );
        // The pilot's own rejoin gate is 1.5x the tolerance; asserting the bare
        // tolerance here only ever passed by luck about where the terminal
        // Hermite happened to land.
        expect(positionError).toBeLessThanOrEqual(
          value.profile.rejoinPositionTolerance * 1.5 + 1e-9,
        );
        expect(velocityError).toBeLessThanOrEqual(
          value.profile.rejoinVelocityTolerance + 1e-9,
        );
        rejoined = true;
        break;
      }
      previousPhase = value.phase;
    }
    expect(rejoined).toBe(true);
    expect(world.reservations.size).toBe(0);
  });

  it("releases reservations on every failed or cancelled approach", () => {
    const blockedWorld = new PrimitiveFlightWorld();
    blockedWorld.obstacles.push({
      center: { x: 0.5, y: 0.32, z: 0.06 },
      radius: 0.04,
    });
    const blocked = pilot(blockedWorld);
    expect(
      commandInsectPilot(
        blocked,
        { type: "land", target: landingTarget("blocked") },
        blockedWorld,
      ),
    ).toBe(false);
    expect(blockedWorld.reservations.size).toBe(0);

    const world = new PrimitiveFlightWorld();
    const cancelled = pilot(world, 1);
    const target = landingTarget("cancelled");
    target.point.x = cancelled.position.x + 0.4;
    expect(commandInsectPilot(cancelled, { type: "land", target }, world)).toBe(
      true,
    );
    expect(world.reservations.size).toBe(1);
    expect(commandInsectPilot(cancelled, { type: "cancel" }, world)).toBe(true);
    expect(world.reservations.size).toBe(1);
    expect(cancelled.phase).toBe("launch");
    advanceUntil(cancelled, world, "rejoin");
    expect(world.reservations.size).toBe(0);
  });

  it("turns a cancellation at rest into a safe outward launch", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("rest-cancel") },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "rest");
    const foldedBeforeLaunch = world.foldedSweeps;
    expect(commandInsectPilot(value, { type: "cancel" }, world)).toBe(true);
    expect(value.phase).toBe("launch");
    expect(world.reservations.get("rest-cancel")).toBe(value.occupantId);
    advanceInsectPilot(value, 1 / 120, world);
    expect(world.foldedSweeps).toBeGreaterThan(foldedBeforeLaunch);
    advanceUntil(value, world, "rejoin");
    expect(world.reservations.size).toBe(0);
  });

  it("keeps wings folded until a narrow object-top launch reaches clear air", () => {
    const world = new PrimitiveFlightWorld();
    // This models a portrait/book face below the Perch: a full flying sphere
    // cannot start at contact, while folded touchdown and normal lift can.
    world.fullSphereMinimumSupportY = 0.22;
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("object-top") },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "rest");
    const foldedBeforeLaunch = world.foldedSweeps;
    const phaseBeforeLaunch = value.wingPhase;
    expect(commandInsectPilot(value, { type: "depart" }, world)).toBe(true);

    let previous = { ...value.position };
    let minimumOpenSweepY = Number.POSITIVE_INFINITY;
    const initialSweepCount = world.sphereSweeps.length;
    for (let frame = 0; frame < 30 * 120 && value.phase === "launch"; frame++) {
      advanceInsectPilot(value, 1 / 120, world);
      const frameDistance = Math.hypot(
        value.position.x - previous.x,
        value.position.y - previous.y,
        value.position.z - previous.z,
      );
      expect(frameDistance).toBeLessThanOrEqual(
        value.profile.maxSpeed / 120 + 1e-6,
      );
      previous = { ...value.position };
      for (const sweep of world.sphereSweeps.slice(initialSweepCount))
        minimumOpenSweepY = Math.min(minimumOpenSweepY, sweep.from.y);
    }

    expect(value.phase).toBe("rejoin");
    expect(value.rejectionCode).toBe("none");
    expect(world.foldedSweeps).toBeGreaterThan(foldedBeforeLaunch);
    expect(minimumOpenSweepY).toBeGreaterThanOrEqual(
      world.fullSphereMinimumSupportY,
    );
    expect(value.wingPhase).not.toBe(phaseBeforeLaunch);
    expect(world.reservations.size).toBe(0);
  });

  it("launches outward when geometry blocks touchdown without releasing in place", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("blocked-touchdown") },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "touchdown");
    // One refused step is survivable now: the pilot slides and keeps flying.
    // Ending the whole landing on a single refusal is what made the arrival
    // read as a butterfly repeatedly changing its mind (ADR 0005).
    world.blockNextTouchdownMovement = true;
    advanceInsectPilot(value, 1 / 120, world);
    expect(value.phase).toBe("touchdown");
    expect(value.rejectionCode).toBe("none");

    // Sustained refusal still launches it outward rather than releasing in
    // place, which would turn the support back into a collider around it.
    world.obstacles.push({ center: { ...value.position }, radius: 0.03 });
    for (let step = 0; step < 240 && value.phase === "touchdown"; step++)
      advanceInsectPilot(value, 1 / 120, world);
    expect(value.phase).toBe("launch");
    expect(value.event).toBe("approach-blocked");
    expect(world.reservations.get("blocked-touchdown")).toBe(value.occupantId);
  });

  it("escapes a persistent collider moved over it during touchdown", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("moved-over-touchdown") },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "touchdown");
    world.obstacles.push({ center: { ...value.position }, radius: 0.03 });
    for (let step = 0; step < 240 && value.phase === "touchdown"; step++)
      advanceInsectPilot(value, 1 / 120, world);
    expect(value.phase).toBe("launch");
    const before = { ...value.position };
    advanceUntil(value, world, "rejoin");
    expect(
      Math.hypot(
        value.position.x - before.x,
        value.position.y - before.y,
        value.position.z - before.z,
      ),
    ).toBeGreaterThan(0.18);
    expect(world.reservations.size).toBe(0);
  });

  it("recovers through the free side of overlapping shelf-scale colliders", () => {
    const boxes: InsectCollisionBox[] = [
      {
        id: "mesh:plank",
        min: { x: -1.32, y: -0.035, z: -0.425 },
        max: { x: 1.32, y: 0.035, z: 0.425 },
      },
      {
        id: "mesh:tall",
        min: { x: 0.06, y: 0.035, z: 0.1 },
        max: { x: 0.1, y: 0.275, z: 0.16 },
      },
    ];
    const index = reviseInsectCollisionIndex(null, boxes);
    const start = { x: 0, y: 0.1, z: 0.13 };
    const world: InsectFlightWorld = {
      sampleCruise(_flightId, _time, out) {
        out.position.x = 0;
        out.position.y = 0.55;
        out.position.z = 0.13;
        out.velocity.x = 0;
        out.velocity.y = 0;
        out.velocity.z = 0;
        out.acceleration.x = 0;
        out.acceleration.y = 0;
        out.acceleration.z = 0;
      },
      sweepSphere(from, to, radius, _allowSupport, allowEscape) {
        return insectCorridorIsClear(
          [from, to],
          radius,
          index,
          null,
          allowEscape,
        );
      },
      tryReserve: () => true,
      release: () => undefined,
    };
    const value = createInsectPilot({
      occupantId: "butterfly:shelf-recovery",
      flightId: 0,
      seed: 3,
      initialTime: 0,
      initial: {
        position: { ...start },
        velocity: { x: 0, y: 0, z: 0 },
        acceleration: { x: 0, y: 0, z: 0 },
      },
      profile: BUTTERFLY_PILOT_PROFILE,
    });
    for (let frame = 0; frame < 10 * 60; frame++)
      advanceInsectPilot(value, 1 / 60, world);
    expect(value.position.y - start.y).toBeGreaterThan(0.2);

    const resting = createInsectPilot({
      occupantId: "butterfly:shelf-departure",
      flightId: 0,
      seed: 4,
      initialTime: 0,
      initial: {
        position: { ...start },
        velocity: { x: 0, y: 0, z: 0 },
        acceleration: { x: 0, y: 0, z: 0 },
      },
      profile: BUTTERFLY_PILOT_PROFILE,
    });
    resting.phase = "rest";
    resting.reservedPerchId = "shelf:perch";
    resting.normal = { x: 0, y: 1, z: 0 };
    resting.tangent = { x: 0, y: 0, z: 1 };
    expect(commandInsectPilot(resting, { type: "depart" }, world)).toBe(true);

    const alternateStart = { x: -0.0324, y: 0.1302, z: 0.3036 };
    const alternateIndex = reviseInsectCollisionIndex(null, [
      boxes[0]!,
      {
        id: "mesh:nearest-exit-blocker",
        min: { x: -0.2108, y: 0.035, z: 0.181 },
        max: { x: -0.1128, y: 0.3073, z: 0.237 },
      },
      {
        id: "mesh:containing-prop",
        min: { x: -0.0041, y: 0.035, z: 0.2625 },
        max: { x: 0.1285, y: 0.1652, z: 0.317 },
      },
    ]);
    const alternateWorld: InsectFlightWorld = {
      sampleCruise(_flightId, _time, out) {
        out.position.x = alternateStart.x;
        out.position.y = 0.55;
        out.position.z = alternateStart.z;
        out.velocity.x = 0;
        out.velocity.y = 0;
        out.velocity.z = 0;
        out.acceleration.x = 0;
        out.acceleration.y = 0;
        out.acceleration.z = 0;
      },
      sweepSphere(from, to, radius, _allowSupport, allowEscape) {
        return insectCorridorIsClear(
          [from, to],
          radius,
          alternateIndex,
          null,
          allowEscape,
        );
      },
      tryReserve: () => true,
      release: () => undefined,
    };
    const alternate = createInsectPilot({
      occupantId: "butterfly:alternate-exit",
      flightId: 0,
      seed: 9,
      initialTime: 0,
      initial: {
        position: { ...alternateStart },
        velocity: { x: 0, y: 0, z: 0 },
        acceleration: { x: 0, y: 0, z: 0 },
      },
      profile: BUTTERFLY_PILOT_PROFILE,
    });
    for (let frame = 0; frame < 10 * 60; frame++)
      advanceInsectPilot(alternate, 1 / 60, alternateWorld);
    expect(alternate.position.y - alternateStart.y).toBeGreaterThan(0.2);
  });
});

describe("Flap Layer", () => {
  const profiles = [
    ["butterfly", BUTTERFLY_PILOT_PROFILE] as const,
    ["moth", MOTH_PILOT_PROFILE] as const,
  ];

  it("reads cruise as on and hover as off, centred on ordinary flight", () => {
    for (const [, profile] of profiles) {
      expect(insectFlapActivation(0, profile.flapReferenceSpeed)).toBeLessThan(
        0.05,
      );
      expect(
        insectFlapActivation(
          profile.flapReferenceSpeed / 2,
          profile.flapReferenceSpeed,
        ),
      ).toBeCloseTo(0.5, 6);
      expect(
        insectFlapActivation(
          profile.flapReferenceSpeed,
          profile.flapReferenceSpeed,
        ),
      ).toBeGreaterThan(0.95);
      // Measured against a speed roam actually reaches, not the pilot's
      // absolute ceiling — otherwise everything sits in its hover pose forever.
      expect(profile.flapReferenceSpeed).toBeLessThan(profile.maxSpeed);
    }
  });

  it("beats faster the faster it flies", () => {
    for (const [, profile] of profiles) {
      const slow = insectWingFrequencyForSpeed(profile, 0);
      const fast = insectWingFrequencyForSpeed(profile, profile.maxSpeed);
      expect(slow).toBeGreaterThan(1);
      expect(fast).toBeGreaterThan(slow);
      expect(fast).toBeLessThanOrEqual(profile.wingFrequency + 1e-9);
      for (let speed = 0; speed < profile.maxSpeed; speed += 0.05)
        expect(
          insectWingFrequencyForSpeed(profile, speed + 0.05),
        ).toBeGreaterThan(insectWingFrequencyForSpeed(profile, speed));
    }
  });

  it("beats DEEPER the slower it flies, so a hovering insect never goes still", () => {
    for (const [, profile] of profiles) {
      const hovering = insectWingAmplitudeForSpeed(profile, 0);
      const cruising = insectWingAmplitudeForSpeed(profile, profile.maxSpeed);
      // Amplitude runs opposite the frequency on purpose. Tying both to speed
      // would leave a slow insect nearly motionless, which is backwards.
      expect(hovering).toBeGreaterThan(cruising);
      expect(cruising).toBeCloseTo(profile.wingAmplitude, 3);
      expect(insectWingFrequencyForSpeed(profile, 0)).toBeLessThan(
        insectWingFrequencyForSpeed(profile, profile.maxSpeed),
      );
    }
  });

  it("pitches the thorax within the published amplitude and only when moving", () => {
    for (const [species, profile] of profiles) {
      expect(insectBodyPitchForSpeed(profile, 0)).toBeLessThan(0.02);
      const cruising = insectBodyPitchForSpeed(profile, profile.maxSpeed);
      expect(cruising).toBeGreaterThan(0.2);
      expect(cruising).toBeLessThanOrEqual(profile.bodyPitchAmplitude + 1e-9);
      // Thirty degrees for a butterfly, twenty for a moth.
      expect(profile.bodyPitchAmplitude).toBeCloseTo(
        species === "butterfly" ? 0.524 : 0.349,
        3,
      );
      expect(profile.bodyPitchFrequency).toBeLessThanOrEqual(3);
    }
  });

  it("flares nose-up into contact and settles flat at rest", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("flare") },
        world,
      ),
    ).toBe(true);

    let peak = 0;
    let landed = false;
    for (let frame = 0; frame < 60 * 40 && !landed; frame++) {
      advanceInsectPilot(value, 1 / 60, world);
      if (value.phase === "touchdown") peak = Math.max(peak, value.bodyPitch);
      if (value.phase === "rest") landed = true;
    }
    expect(landed).toBe(true);
    expect(peak).toBeGreaterThan(value.profile.flarePitch * 0.5);

    for (let frame = 0; frame < 60; frame++)
      advanceInsectPilot(value, 1 / 60, world);
    expect(Math.abs(value.bodyPitch)).toBeLessThan(0.02);
  });

  it("cannot move the insect", () => {
    // The Flap Layer writes one angle. Zeroing every flap value must leave the
    // flight path bit-identical, which is what makes it free to tune.
    const flown = (bodyPitchAmplitude: number) => {
      const world = new PrimitiveFlightWorld();
      const value = createInsectPilot({
        occupantId: "flap",
        flightId: 0,
        seed: 4,
        initialTime: 0,
        initial: {
          position: { x: 0, y: 0.4, z: 0.4 },
          velocity: { x: 0.3, y: 0, z: 0 },
          acceleration: { x: 0, y: 0, z: 0 },
        },
        profile: { ...BUTTERFLY_PILOT_PROFILE, bodyPitchAmplitude },
      });
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("flap") },
        world,
      );
      for (let frame = 0; frame < 60 * 12; frame++)
        advanceInsectPilot(value, 1 / 60, world);
      return { ...value.position };
    };

    expect(flown(0)).toEqual(flown(1.2));
  });
});

describe("Escape", () => {
  /** A resting pilot on a Perch, with a steering roam so departure resolves
   * into ordinary flight rather than a compiled rejoin. */
  function resting(world: PrimitiveFlightWorld) {
    const value = createInsectPilot({
      occupantId: "butterfly:escape",
      flightId: 0,
      seed: 41,
      initialTime: 0,
      initial: initialSample(world),
      profile: BUTTERFLY_PILOT_PROFILE,
      roam: {
        profile: BUTTERFLY_STEERING_PROFILE,
        containment: createInsectFlightVolumeContainment(ORIGIN_VOLUME),
        volume: ORIGIN_VOLUME,
        transit: null,
        evade: null,
      },
    });
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget() },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "rest");
    return value;
  }

  it("scales its ceiling by what provoked it", () => {
    const world = new PrimitiveFlightWorld();
    const ordinary = pilot(world);
    const base = insectPilotPhaseLimits(ordinary);
    const causes = ["grab", "drag", "pointer", "calm"] as const;
    const accelerations = causes.map((cause) => {
      const value = resting(new PrimitiveFlightWorld());
      expect(
        commandInsectPilot(
          value,
          { type: "depart", cause },
          value.roam ? world : world,
        ),
      ).toBe(true);
      return insectPilotPhaseLimits(value).acceleration;
    });

    // A grabbed prop throws the insect off; a passing cursor moves it along.
    expect(accelerations).toEqual([9, 6, 4, base.acceleration]);
    expect(accelerations[0]).toBeGreaterThan(accelerations[1]!);
    expect(accelerations[1]).toBeGreaterThan(accelerations[2]!);
    expect(accelerations[2]).toBeGreaterThan(accelerations[3]!);
  });

  it("always takes off, even when every swept corridor is blocked", () => {
    const world = new PrimitiveFlightWorld();
    const value = resting(world);
    // Wrap the Perch so no candidate direction can be proven clear. The old
    // implementation returned false here and simply kept resting on the prop
    // that had just been grabbed.
    for (const offset of [
      { x: 0.4, y: 0, z: 0 },
      { x: -0.4, y: 0, z: 0 },
      { x: 0, y: 0.4, z: 0 },
      { x: 0, y: 0, z: 0.4 },
      { x: 0, y: 0, z: -0.4 },
    ])
      world.obstacles.push({
        center: {
          x: value.contact.x + offset.x,
          y: value.contact.y + offset.y,
          z: value.contact.z + offset.z,
        },
        radius: 0.34,
      });

    expect(
      commandInsectPilot(value, { type: "depart", cause: "grab" }, world),
    ).toBe(true);
    expect(value.phase).toBe("launch");
  });

  it("resolves on ground made, never on coming to a halt", () => {
    const world = new PrimitiveFlightWorld();
    const value = resting(world);
    const contact = { ...value.contact };
    expect(
      commandInsectPilot(value, { type: "depart", cause: "pointer" }, world),
    ).toBe(true);

    let displacementAtExit = 0;
    for (let frame = 0; frame < 60 * 6; frame++) {
      advanceInsectPilot(value, 1 / 60, world);
      if (value.phase === "launch") continue;
      displacementAtExit = Math.hypot(
        value.position.x - contact.x,
        value.position.y - contact.y,
        value.position.z - contact.z,
      );
      break;
    }
    expect(value.phase).toBe("roam");
    expect(displacementAtExit).toBeGreaterThanOrEqual(0.25);
    expect(world.reservations.size).toBe(0);
  });

  it("makes holding station above the fled Perch unreachable", () => {
    // Not "unlikely": the old exit REQUIRED stopping dead within eighteen
    // millimetres of a point one launch-length out, so hovering above the site
    // was literally the way to finish. Pin the insect in place and confirm it
    // still lets go, on a bounded clock, rather than waiting there.
    const world = new PrimitiveFlightWorld();
    const value = resting(world);
    const contact = { ...value.contact };
    world.obstacles.push({ center: { ...contact }, radius: 0.5 });
    expect(
      commandInsectPilot(value, { type: "depart", cause: "grab" }, world),
    ).toBe(true);

    let heldAbovePerch = 0;
    let released = false;
    for (let frame = 0; frame < 60 * 8; frame++) {
      advanceInsectPilot(value, 1 / 60, world);
      const speed = Math.hypot(
        value.velocity.x,
        value.velocity.y,
        value.velocity.z,
      );
      const near =
        Math.hypot(
          value.position.x - contact.x,
          value.position.y - contact.y,
          value.position.z - contact.z,
        ) < 0.4;
      if (value.phase === "launch" && near && speed < 0.08) heldAbovePerch++;
      if (!value.reservedPerchId && value.phase !== "launch") {
        released = true;
        break;
      }
    }

    expect(released).toBe(true);
    expect(world.reservations.size).toBe(0);
    // Whatever happened, it was over inside the forced-release window.
    expect(heldAbovePerch / 60).toBeLessThan(3);
  });

  it("tries another way out, then lets go, when nothing moves at all", () => {
    // A world that refuses every movement once the Escape starts. Nothing real
    // behaves like this — with soft collision an insect can always make ground
    // — but it is the only way to exercise the two fallbacks, and it proves
    // neither of them can hang.
    class ImmovableWorld extends PrimitiveFlightWorld {
      frozen = false;
      override sweepSphere(
        from: PilotVector,
        to: PilotVector,
        radius: number,
        allowReservedSupportContact = false,
        allowPenetrationEscape = false,
      ) {
        if (this.frozen) return false;
        return super.sweepSphere(
          from,
          to,
          radius,
          allowReservedSupportContact,
          allowPenetrationEscape,
        );
      }
      override sweepFolded() {
        return !this.frozen;
      }
    }
    const world = new ImmovableWorld();
    const value = resting(world);
    expect(
      commandInsectPilot(value, { type: "depart", cause: "drag" }, world),
    ).toBe(true);
    world.frozen = true;

    let redirectedBy = -1;
    let releasedBy = -1;
    for (let frame = 0; frame < 60 * 5; frame++) {
      advanceInsectPilot(value, 1 / 60, world);
      if (redirectedBy < 0 && value.escapeRedirects > 0)
        redirectedBy = frame / 60;
      if (releasedBy < 0 && !value.reservedPerchId) {
        releasedBy = frame / 60;
        break;
      }
    }

    expect(redirectedBy).toBeGreaterThan(1.4);
    expect(redirectedBy).toBeLessThan(1.7);
    expect(releasedBy).toBeGreaterThan(2.9);
    expect(releasedBy).toBeLessThan(3.2);
    expect(world.reservations.size).toBe(0);
  });
});

describe("landing over a support that is really there", () => {
  it("reaches rest instead of bailing out of the inspection hover", () => {
    const world = new SupportedFlightWorld();
    const value = pilot(world, 5);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("support:perch") },
        world,
      ),
    ).toBe(true);

    // The whole cycle, not merely "did not crash": the regression this pins
    // let approach and hover run forever and never produced a landing.
    const seen = new Set<InsectPilot["phase"]>();
    for (let frame = 0; frame < 60 * 60; frame++) {
      advanceInsectPilot(value, 1 / 60, world);
      seen.add(value.phase);
      if (value.phase === "rest") break;
    }
    expect(value.phase).toBe("rest");
    expect(seen.has("hover")).toBe(true);
    expect(seen.has("touchdown")).toBe(true);
    expect(value.rejectionCode).toBe("none");
  });

  it("flies hover under the same support licence the plan was compiled with", () => {
    const world = new SupportedFlightWorld();
    const value = pilot(world, 6);
    commandInsectPilot(
      value,
      { type: "land", target: landingTarget("support:licence") },
      world,
    );
    let hoverSteps = 0;
    let hoverStepsAllowingSupport = 0;
    for (let frame = 0; frame < 60 * 60; frame++) {
      const before = world.supportContactFlags.length;
      const phase = value.phase;
      advanceInsectPilot(value, 1 / 60, world);
      if (phase === "hover")
        for (const flag of world.supportContactFlags.slice(before)) {
          hoverSteps++;
          if (flag) hoverStepsAllowingSupport++;
        }
      if (value.phase === "rest") break;
    }
    expect(hoverSteps).toBeGreaterThan(0);
    // Not "most of them": a single hover step measured without the licence is
    // one refused movement, and one refused movement ends the landing.
    expect(hoverStepsAllowingSupport).toBe(hoverSteps);
  });
});

describe("the perched idle", () => {
  it("stays still, then opens and closes once", () => {
    // What this replaces is a constant ±5.7° at 1.05 Hz. A settled butterfly
    // is STILL for a long time and then opens its wings once, slowly; a
    // permanent low-amplitude twitch reads as an idling machine.
    const profile = BUTTERFLY_PILOT_PROFILE;
    expect(restingIdleOpening(profile, -1)).toBe(0);
    expect(restingIdleOpening(profile, 0)).toBe(0);
    expect(restingIdleOpening(profile, profile.restingIdle.duration)).toBe(0);
    expect(
      restingIdleOpening(profile, profile.restingIdle.duration / 2),
    ).toBeCloseTo(1, 9);
    // One open and close, never a cycle: it rises once and comes back.
    let previous = 0;
    let turns = 0;
    for (let step = 1; step <= 40; step++) {
      const value = restingIdleOpening(
        profile,
        (step / 40) * profile.restingIdle.duration,
      );
      if (step > 1 && Math.sign(value - previous) < 0 && previous > 0) turns++;
      previous = value;
    }
    expect(turns).toBeGreaterThan(0);
  });

  it("rocks the thorax through the opening and never outside it", () => {
    // Owner review: "maybe a tiny bit of intermittent bobbing?" The delicate
    // part is that a perched insect must not TRANSLATE — that leaves the
    // contact plane — so the bob is pitch, and it rides the wing episode
    // rather than running on a timer of its own.
    const profile = BUTTERFLY_PILOT_PROFILE;
    expect(profile.restingIdle.bob).toBeGreaterThan(0);
    // A still insect is still. `restIdleAge` is -1 between openings.
    expect(restingIdleBob(profile, -1)).toBe(0);
    expect(restingIdleBob(profile, 0)).toBe(0);
    expect(restingIdleBob(profile, profile.restingIdle.duration)).toBe(0);

    // A full cycle, not a hump: the insect rocks forward and then back, and
    // ends where it started rather than nodded over.
    const quarter = restingIdleBob(profile, profile.restingIdle.duration / 4);
    const half = restingIdleBob(profile, profile.restingIdle.duration / 2);
    const threeQuarter = restingIdleBob(
      profile,
      (profile.restingIdle.duration * 3) / 4,
    );
    expect(quarter).toBeCloseTo(profile.restingIdle.bob, 6);
    expect(half).toBeCloseTo(0, 6);
    expect(threeQuarter).toBeCloseTo(-profile.restingIdle.bob, 6);

    // Tiny, as asked. A perched insect that pitches like a flying one reads as
    // a landing that never finished.
    expect(profile.restingIdle.bob).toBeLessThan(
      profile.bodyPitchAmplitude / 4,
    );
  });

  it("never puts two residents on the same schedule", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 21; seed++)
      for (let count = 0; count < 4; count++)
        seen.add(
          restingIdleInterval(BUTTERFLY_PILOT_PROFILE, seed, count).toFixed(6),
        );
    // Deterministic per insect AND per opening, so a long rest never repeats
    // an interval either.
    expect(seen.size).toBe(21 * 4);
    const [low, high] = BUTTERFLY_PILOT_PROFILE.restingIdle.interval;
    for (const value of seen) {
      expect(Number(value)).toBeGreaterThanOrEqual(low);
      expect(Number(value)).toBeLessThanOrEqual(high);
    }
  });

  it("opens the wings while perched and never while flying", () => {
    const world = new PrimitiveFlightWorld();
    const value = pilot(world);
    expect(
      commandInsectPilot(
        value,
        { type: "land", target: landingTarget("idle-perch") },
        world,
      ),
    ).toBe(true);
    advanceUntil(value, world, "rest");
    // Let the terminal position hold finish converging onto the contact; what
    // is being measured is the IDLE, not the last few millimetres of landing.
    for (let step = 0; step < 120; step++)
      advanceInsectPilot(value, 1 / 120, world);
    const settled = { ...value.position };

    let opened = 0;
    let still = 0;
    let moved = 0;
    for (let step = 0; step < 120 * 30; step++) {
      advanceInsectPilot(value, 1 / 120, world);
      if (value.phase !== "rest") break;
      const openness = 1 - value.wingAngle / (Math.PI / 2 - 0.12);
      if (openness > 0.25) opened++;
      else still++;
      moved = Math.max(
        moved,
        Math.hypot(
          value.position.x - settled.x,
          value.position.y - settled.y,
          value.position.z - settled.z,
        ),
      );
    }
    expect(opened).toBeGreaterThan(0);
    // Mostly still. The opening is an event, not a state.
    expect(still).toBeGreaterThan(opened * 2);
    // Presentation only. The idle repositions nothing — translation would
    // re-enter collision — so what is left over thirty seconds is the pilot's
    // existing station-keeping wobble, about a millimetre.
    expect(moved).toBeLessThan(0.002);
  });
});
