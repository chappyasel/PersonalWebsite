import * as THREE from "three";
import { describe, expect, it } from "vitest";
import fs from "node:fs";

import {
  BUTTERFLY_COUNT,
  BUTTERFLY_EVASION,
  BUTTERFLY_OCCUPANCY,
  BUTTERFLY_STARVED_GAP,
  assignButterflyTransits,
  butterflyEscapeCause,
  butterflyEvasionStrength,
  butterflyFlightVolume,
  butterflyInitialResidency,
  butterflyIsActiveNeighbor,
  butterflyMayBeginLanding,
  butterflyNextAttemptAt,
  butterflyPerchFailureMessage,
  butterflyStartPosition,
  butterflyTrailPoints,
  butterflyTransitHeading,
  createButterflyMotion,
  recordButterflyTrail,
  selectForcedButterflyResident,
  updateButterflyResidency,
  updateButterflyStallState,
} from "./Butterflies";
import {
  BUTTERFLY_FLIGHT_VOLUME_EXTENT,
  clampToInsectFlightVolume,
  insectFlightVolumeContains,
  insectFlightVolumePoint,
  insectFlightVolumeRegion,
} from "./insectFlightVolume";
import {
  ThreeInsectFlightWorld,
  prepareInsectLandingTarget,
  registerInsectCollisionRoot,
} from "./insectFlightWorld";
import { insectOwnerIsDisturbed } from "./insectDisturbance";
import {
  type InsectPerch,
  getInsectPerch,
  getInsectPerches,
  insectPerchCatalog,
  registerInsectPerch,
} from "./insectPerches";
import {
  BUTTERFLY_PILOT_PROFILE,
  type InsectLandingTarget,
  commandInsectPilot,
  createInsectPilot,
} from "./insectPilot";
import {
  BUTTERFLY_RESIDENCY,
  UNIT_FLIGHT_VOLUMES,
  unitCenterX,
} from "./insectResidency";
import { registerSceneInteraction } from "./interactionRegistry";

const butterflySource = fs.readFileSync(
  new URL("./Butterflies.tsx", import.meta.url),
  "utf8",
);
const wildlifeSource = fs.readFileSync(
  new URL("./Wildlife.tsx", import.meta.url),
  "utf8",
);

describe("butterfly roaming state", () => {
  it("treats press and touch focus as direct prop disturbances for both species", () => {
    expect(butterflySource).toContain("insectOwnerIsDisturbed");
    expect(wildlifeSource).toContain("insectOwnerIsDisturbed");
    expect(butterflySource).not.toContain(
      "ownerId === stacks.hovered || ownerId === stacks.dragging",
    );
    expect(wildlifeSource).not.toContain(
      "ownerId === stacks.hovered || ownerId === stacks.dragging",
    );

    const idle = {
      hovered: null,
      dragging: null,
      pressedInteraction: null,
      focusedInteraction: null,
    };
    expect(insectOwnerIsDisturbed("books:stack", idle)).toBe(false);
    expect(
      insectOwnerIsDisturbed("books:stack", {
        ...idle,
        pressedInteraction: "books:stack",
      }),
    ).toBe(true);
    expect(
      insectOwnerIsDisturbed("books:stack", {
        ...idle,
        focusedInteraction: "books:stack",
      }),
    ).toBe(true);
    expect(
      insectOwnerIsDisturbed("books:stack", {
        ...idle,
        pressedInteraction: "about:chair",
      }),
    ).toBe(false);
  });

  it("reports only a sustained low-speed roam as a stall", () => {
    const observation = {
      lowSpeedSince: -1,
      lastMeaningfulMovement: 0,
    };
    expect(
      updateButterflyStallState(observation, {
        phase: "roam",
        speed: 0.079,
        time: 4,
      }),
    ).toBe(false);
    expect(
      updateButterflyStallState(observation, {
        phase: "roam",
        speed: 0.079,
        time: 4.51,
      }),
    ).toBe(true);
    expect(
      updateButterflyStallState(observation, {
        phase: "rest",
        speed: 0,
        time: 5,
      }),
    ).toBe(false);
    expect(observation.lowSpeedSince).toBe(-1);
  });

  it("classifies a Disturbance by what caused it, not by its strength", () => {
    expect(
      butterflyEscapeCause({ grabbed: true, dragging: true, proximity: true }),
    ).toBe("grab");
    expect(
      butterflyEscapeCause({ grabbed: false, dragging: true, proximity: true }),
    ).toBe("drag");
    expect(
      butterflyEscapeCause({
        grabbed: false,
        dragging: false,
        proximity: true,
      }),
    ).toBe("pointer");
    expect(
      butterflyEscapeCause({
        grabbed: false,
        dragging: false,
        proximity: false,
      }),
    ).toBe("calm");
  });

  it("starts every resident inside its own Flight Volume", () => {
    for (let index = 0; index < BUTTERFLY_COUNT; index++) {
      const motion = createButterflyMotion(
        index,
        butterflyInitialResidency(index),
      );
      const position = { x: 0, y: 0, z: 0 };
      butterflyStartPosition(motion, index, position);
      const volume = butterflyFlightVolume(motion);
      expect(insectFlightVolumeContains(volume, position)).toBe(true);
      // In front of the shelf line, where the camera can see it.
      expect(insectFlightVolumeRegion(volume, position)).toBe("front");
    }
  });

  it("keeps a bounded oldest-first trail as a resident moves", () => {
    const motion = createButterflyMotion(1, 0);
    for (let step = 0; step < 200; step++)
      recordButterflyTrail(motion, { x: step, y: 0, z: 0 }, step * 0.25);
    const trail = butterflyTrailPoints(motion);

    expect(trail).toHaveLength(120);
    expect(trail[0]!.x).toBe(80);
    expect(trail.at(-1)!.x).toBe(199);
  });
});

describe("butterfly shelf residents", () => {
  it("puts somebody on every one of the seven Units at mount", () => {
    // The count is no longer a multiple of the Unit count — it is written to
    // what a FRAME should hold, not to what a shelf should hold (owner review:
    // "3-5 at all times feels ideal") — so the boot arrangement has to spread
    // rather than fill three at a time, or unit 6 mounts empty and the floor of
    // 2 has to be repaired by a crossing before anyone has scrolled anywhere.
    expect(BUTTERFLY_COUNT).toBe(18);

    const residents = Array.from({ length: BUTTERFLY_COUNT }, (_, index) =>
      butterflyInitialResidency(index),
    );
    for (let unit = 0; unit < 7; unit++)
      expect(
        residents.filter((initialResidency) => initialResidency === unit)
          .length,
      ).toBeGreaterThanOrEqual(BUTTERFLY_RESIDENCY.minPerUnit);
    expect(residents.every((unit) => unit >= 0 && unit < 7)).toBe(true);
  });

  it("judges active-neighbor eligibility on where a resident is now", () => {
    expect(butterflyIsActiveNeighbor(2, 1)).toBe(true);
    // Two Units of reach, not one: a shelf the visitor is about to arrive at
    // has to be populated BEFORE they arrive, or every landing happens in full
    // view and every shelf is empty on arrival.
    expect(butterflyIsActiveNeighbor(3, 1)).toBe(true);
    expect(butterflyIsActiveNeighbor(4, 1)).toBe(false);
    expect(butterflyIsActiveNeighbor(5, 6)).toBe(true);
  });

  it("selects exactly one available active-shelf resident for a force request", () => {
    // Index no longer implies Unit — Residency migrates — so the caller's
    // lookup is what decides who counts as a resident of the active shelf.
    const unitOf = (index: number) => (index === 2 || index === 17 ? 4 : 0);
    const attempted: number[] = [];
    const selected = selectForcedButterflyResident(4, unitOf, (index) => {
      attempted.push(index);
      return index === 17;
    });

    expect(selected).toBe(17);
    expect(attempted).toEqual([2, 17]);
    expect(selectForcedButterflyResident(4, unitOf, () => false)).toBeNull();
  });

  it("caps settled residents loosely and arriving ones tightly", () => {
    // Occupancy is meant to fall out of how long an insect STAYS, not out of
    // permission to arrive. What has to stay small is the number flying at the
    // same planks at once, and the engaged cap is one short of a Unit's full
    // demand so a busy shelf always has somebody still in the air.
    expect(butterflyMayBeginLanding({ engaged: 0, approaching: 0 })).toBe(true);
    expect(butterflyMayBeginLanding({ engaged: 2, approaching: 1 })).toBe(true);
    expect(butterflyMayBeginLanding({ engaged: 3, approaching: 0 })).toBe(
      false,
    );
    expect(butterflyMayBeginLanding({ engaged: 1, approaching: 2 })).toBe(
      false,
    );
    expect(BUTTERFLY_OCCUPANCY.engaged).toBeLessThan(
      BUTTERFLY_RESIDENCY.maxPerUnit,
    );
  });

  it("puts almost all of the pointer lean in the innermost third", () => {
    // "Subtly elusive" is a statement about the CURVE, not the strength: a
    // linear falloff makes every resident within the radius lean a little,
    // which reads as the whole room tilting away from the cursor. Quadratic
    // means a resident a hand's width away barely notices and the one you are
    // actually chasing keeps sliding out of reach.
    const radius = BUTTERFLY_EVASION.radiusPx;
    expect(butterflyEvasionStrength(0)).toBe(1);
    expect(butterflyEvasionStrength(radius)).toBe(0);
    expect(butterflyEvasionStrength(radius * 2)).toBe(0);
    expect(butterflyEvasionStrength(Number.POSITIVE_INFINITY)).toBe(0);
    expect(butterflyEvasionStrength(radius * 0.66)).toBeLessThan(0.12);
    expect(butterflyEvasionStrength(radius * 0.33)).toBeGreaterThan(0.4);
  });

  it("stops waiting out a flight when its shelf has emptied", () => {
    // "How can we have it be that there's basically always 1-2 on perches?"
    // The gap between landings is a flight, which is right for a shelf that
    // already has somebody on it and wrong for one that has nobody.
    expect(butterflyNextAttemptAt(40, 1, 10)).toBe(40);
    expect(butterflyNextAttemptAt(40, 0, 10)).toBe(10 + BUTTERFLY_STARVED_GAP);
    // ...but a resident that has just FAILED to find a Perch is already
    // retrying faster than this, and must not be pulled in further.
    expect(butterflyNextAttemptAt(12.5, 0, 10)).toBe(12.5);
    // ...and one that is already due stays due.
    expect(butterflyNextAttemptAt(5, 0, 10)).toBe(5);
  });

  it("carries a selected forced Perch through preparation, planning, and reservation", () => {
    const scene = new THREE.Scene();
    const unitRoot = new THREE.Group();
    const ownerRoot = new THREE.Group();
    const supportGeometry = new THREE.BoxGeometry(1, 0.04, 1);
    const supportMaterial = new THREE.MeshBasicMaterial();
    const support = new THREE.Mesh(supportGeometry, supportMaterial);
    const anchor = new THREE.Object3D();
    const perchId = "test:force-landing";
    const occupantId = "butterfly:0";
    support.position.y = 0;
    anchor.position.set(0, 0.02, 0);
    ownerRoot.add(support);
    unitRoot.add(ownerRoot, anchor);
    scene.add(unitRoot);
    unitRoot.updateWorldMatrix(true, true);

    const perch: InsectPerch = {
      id: perchId,
      unitIndex: 0,
      kind: "perch",
      ownerId: "test:force-owner",
      ownerPrefix: null,
      lampId: null,
      clearance: 0.12,
      tangent: [1, 0, 0],
      contactDistanceTolerance: 0.08,
      normalTolerance: 0.3,
      anchor,
      normal: [0, 1, 0],
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(0, 1, 0),
    };
    const releaseInteraction = registerSceneInteraction({
      id: "test:force-owner",
      root: ownerRoot,
      activeUnits: [0],
    });
    const releasePerch = registerInsectPerch(perch);
    const releaseCollision = registerInsectCollisionRoot(0, unitRoot);
    const releases = [releaseInteraction, releasePerch, releaseCollision];
    const initial = {
      position: { x: 0, y: 0.35, z: -0.9 },
      velocity: { x: 0.3, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
    };
    const target: InsectLandingTarget = {
      id: "",
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      clearance: 0,
    };
    const world = new ThreeInsectFlightWorld(
      occupantId,
      "butterfly",
      (_flightId, _time, out) => {
        out.position = { ...initial.position };
        out.velocity = { ...initial.velocity };
        out.acceleration = { ...initial.acceleration };
      },
    );

    try {
      world.setContext(0, 1);
      const selected = selectForcedButterflyResident(
        0,
        () => 0,
        (index) => index === 0,
      );
      const candidate = [...getInsectPerches().values()].find(
        (value) => value.unitIndex === 0,
      );
      const pilot = createInsectPilot({
        occupantId,
        flightId: selected!,
        seed: selected!,
        initialTime: 1,
        initial,
        profile: BUTTERFLY_PILOT_PROFILE,
      });

      expect(selected).toBe(0);
      expect(candidate?.id).toBe(perchId);
      expect(
        prepareInsectLandingTarget(candidate!.id, "butterfly", target),
      ).toBe(true);
      expect(target.id).toBe(perchId);
      expect(getInsectPerch(target.id)).toBe(perch);
      expect(
        commandInsectPilot(pilot, { type: "land", target }, world),
        `Landing Plan rejected: ${pilot.rejectionCode}.`,
      ).toBe(true);
      expect(pilot.reservedPerchId).toBe(perchId);

      world.release(perchId, occupantId);
      releasePerch();
      const missingPerchPilot = createInsectPilot({
        occupantId,
        flightId: 0,
        seed: 0,
        initialTime: 1,
        initial,
        profile: BUTTERFLY_PILOT_PROFILE,
      });
      expect(
        commandInsectPilot(missingPerchPilot, { type: "land", target }, world),
      ).toBe(false);
      expect(missingPerchPilot.rejectionCode).toBe("perch-not-found");
    } finally {
      world.release(perchId, occupantId);
      world.dispose();
      for (const release of releases.reverse()) release();
      supportGeometry.dispose();
      supportMaterial.dispose();
    }
  });

  it("surfaces the exact diagnostic when a forced target cannot be prepared", () => {
    expect(
      butterflyPerchFailureMessage({
        rejectionCode: "contact-too-distant",
        rejectionReason:
          "The nearest contact is outside the authored distance tolerance.",
      }),
    ).toBe(
      "Perch rejected: contact-too-distant — The nearest contact is outside the authored distance tolerance.",
    );
  });
});

describe("residents land where they live", () => {
  it("never lets a release from an authored Perch be clamped", () => {
    // Roam's last-resort clamp is a hard position write, so a Perch a resident
    // may reach has to be somewhere its own Unit's containment would leave it
    // alone — otherwise takeoff ends in a teleport across the room. That is the
    // exact invariant, and it is not the same as "inside the authored extent":
    // the Training barbell plate sits 46 cm past its Unit's lateral face, which
    // the closed volumes used to clamp and the handoff band now covers. This is
    // the geometric half of the contract; `Butterflies.tsx` owns the other half
    // by only offering candidates whose `unitIndex` is `motion.currentUnit`.
    insectPerchCatalog().forEach((unit, unitIndex) => {
      const volume = UNIT_FLIGHT_VOLUMES[unitIndex]!;
      for (const definition of unit) {
        const world = { x: 0, y: 0, z: 0 };
        insectFlightVolumePoint(
          volume,
          {
            x: definition.position[0],
            y: definition.position[1],
            z: definition.position[2],
          },
          world,
        );
        expect(
          clampToInsectFlightVolume(volume, world, { x: 0, y: 0, z: 0 }, 0.05),
          `${definition.id} is clamped by its own Unit's Flight Volume`,
        ).toBe(false);
      }
    });
  });

  it("keeps every Perch inside its own Unit's authored extent", () => {
    // The x-only version of this missed the Training barbell entirely. The
    // barbell lies diagonally across the corner of the shelf, so its near plate
    // is fine in x and 0.29 m BEHIND the back wall, while its far plate is fine
    // in z and 0.33 m past the lateral face. An invariant written to the axis
    // that happened to fail last time is not an invariant.
    const extent = BUTTERFLY_FLIGHT_VOLUME_EXTENT;
    insectPerchCatalog().forEach((unit, unitIndex) => {
      for (const definition of unit) {
        const [x, y, z] = definition.position;
        const where = `${definition.id} on unit ${unitIndex}`;
        expect(Math.abs(x), `${where}: x`).toBeLessThanOrEqual(
          extent.halfWidth,
        );
        expect(y, `${where}: y`).toBeGreaterThanOrEqual(extent.minY);
        expect(y, `${where}: y`).toBeLessThanOrEqual(extent.maxY);
        expect(z, `${where}: z`).toBeGreaterThanOrEqual(extent.minZ);
        expect(z, `${where}: z`).toBeLessThanOrEqual(extent.maxZ);
      }
    });
  });
});

describe("residency migrates", () => {
  const worldPoint = (unit: number, local: [number, number, number]) => {
    const out = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(
      UNIT_FLIGHT_VOLUMES[unit]!,
      { x: local[0], y: local[1], z: local[2] },
      out,
    );
    return out;
  };
  const balanced = () => [3, 3, 3, 3, 3, 3, 3];

  it("adopts a neighbour without moving the insect", () => {
    const motion = createButterflyMotion(7, 3);
    // Past the seam: unit 4 already contains this point, which is the only
    // state in which a handoff moves nothing.
    const position = worldPoint(3, [
      BUTTERFLY_FLIGHT_VOLUME_EXTENT.halfWidth + 0.35,
      0.3,
      1.2,
    ]);
    const before = { ...position };
    const velocity = { x: 0.4, y: 0, z: 0 };
    const residents = balanced();

    let event = "none";
    for (let step = 0; step < 400 && event === "none"; step++) {
      event = updateButterflyResidency({
        motion,
        position,
        velocity,
        roaming: true,
        residents,
        cameraX: unitCenterX(4),
        rehomingMargin: 1000,
        step: 1 / 60,
        time: step / 60,
      });
    }

    expect(event).toBe("migrated");
    expect(motion.currentUnit).toBe(4);
    expect(position).toEqual(before);
    expect(residents[3]).toBe(2);
    expect(residents[4]).toBe(4);
    expect(motion.rehomedAt).toBe(-1);
  });

  it("sends only as many residents as the imbalance calls for", () => {
    // Judged per insect, "am I surplus?" is true for every resident of an
    // over-populated Unit at once, so a shelf one over its demand used to send
    // all of them across together — a conveyor belt, not a redistribution. It
    // also starved the Landing Cycle, because a resident under orders does not
    // attempt a Perch.
    const motions = [0, 0, 0, 0, 0, 0].map((unit, index) =>
      createButterflyMotion(index + 1, unit),
    );
    const residents = [6, 2, 2, 2, 3, 3, 3];
    const demand = [4, 2, 2, 2, 3, 5, 3];
    assignButterflyTransits(motions, residents, demand, () => true, 0);

    const ordered = motions.filter((motion) => motion.transitTo !== null);
    expect(ordered).toHaveLength(2);
    for (const motion of ordered) expect(motion.transitTo).toBe(5);

    // Sticky: the same two keep their orders rather than the population
    // re-deciding who is moving sixty times a second.
    const before = motions.map((motion) => motion.transitTo);
    assignButterflyTransits(motions, residents, demand, () => true, 0);
    expect(motions.map((motion) => motion.transitTo)).toEqual(before);

    // ...and released the moment the reason goes.
    assignButterflyTransits(motions, residents, residents, () => true, 0);
    expect(motions.every((motion) => motion.transitTo === null)).toBe(true);
  });

  it("never sends more of the room across at once than a viewer can read", () => {
    // "The butterflies moving between sections makes it look like there's a
    // stampede." Nothing in the demand model bounds the number of simultaneous
    // crossings: one scroll can leave four Units surplus at the same instant
    // and every one of them is entitled to send.
    const motions = Array.from({ length: 12 }, (_, index) =>
      createButterflyMotion(index + 1, index % 4),
    );
    const residents = [3, 3, 3, 3, 2, 2, 2];
    const demand = [1, 1, 1, 1, 4, 4, 4];
    assignButterflyTransits(motions, residents, demand, () => true, 0);

    const ordered = motions.filter((motion) => motion.transitTo !== null);
    expect(ordered).toHaveLength(BUTTERFLY_RESIDENCY.maxConcurrentTransits);
  });

  it("staggers departures instead of turning a cohort together", () => {
    const motions = Array.from({ length: 6 }, (_, index) =>
      createButterflyMotion(index + 1, 3),
    );
    const residents = [2, 2, 2, 5, 2, 2, 2];
    const demand = [2, 2, 3, 2, 3, 2, 2];
    assignButterflyTransits(motions, residents, demand, () => true, 100);

    const ordered = motions.filter((motion) => motion.transitTo !== null);
    expect(ordered.length).toBeGreaterThan(1);
    const [low, high] = BUTTERFLY_RESIDENCY.transitStagger;
    for (const motion of ordered) {
      // Orders are handed out on ONE frame; the crossings must not start on
      // one. Until this passes the resident roams normally, so it leaves from
      // wherever its own wander has taken it by then.
      expect(motion.transitAt).toBeGreaterThanOrEqual(100 + low);
      expect(motion.transitAt).toBeLessThanOrEqual(100 + high);
      expect(butterflyTransitHeading(motion, { x: 0, y: 0, z: 0 }, 100)).toBe(
        null,
      );
    }
    expect(new Set(ordered.map((motion) => motion.transitAt)).size).toBe(
      ordered.length,
    );
    // ...and the heading is live once the delay has passed.
    const first = ordered[0]!;
    expect(
      butterflyTransitHeading(first, { x: 0, y: 0, z: 0 }, first.transitAt),
    ).not.toBe(null);
  });

  it("feeds a shelf that is short on both sides from both sides", () => {
    // "Shouldn't they be coming in from both directions?" Scanning ascending
    // always resolved an equidistant pair leftward, so a surplus Unit between
    // two deficits sent every resident the same way and the visitor saw single
    // file.
    const motions = Array.from({ length: 4 }, (_, index) =>
      createButterflyMotion(index + 1, 3),
    );
    const residents = [2, 2, 2, 6, 2, 2, 2];
    const demand = [2, 2, 3, 2, 3, 2, 2];
    assignButterflyTransits(motions, residents, demand, () => true, 0);

    const destinations = motions
      .map((motion) => motion.transitTo)
      .filter((unit): unit is number => unit !== null);
    expect(destinations).toContain(2);
    expect(destinations).toContain(4);
  });

  it("re-homes a resident under orders only while it is provably off screen", () => {
    const inFrame = createButterflyMotion(9, 0);
    inFrame.transitTo = 5;
    const position = worldPoint(0, [0, 0.3, 1.2]);
    const velocity = { x: 0.2, y: 0, z: 0 };
    const residents = [6, 2, 2, 2, 3, 3, 3];

    expect(
      updateButterflyResidency({
        motion: inFrame,
        position,
        velocity,
        roaming: true,
        residents,
        cameraX: unitCenterX(0),
        rehomingMargin: 12,
        step: 1 / 60,
        time: 1,
      }),
    ).toBe("none");
    // Not re-homed, so it flies: Transit is the fallback that always works
    // when nothing may be moved for free.
    expect(inFrame.currentUnit).toBe(0);
    expect(inFrame.transitTo).toBe(5);

    const offScreen = createButterflyMotion(10, 0);
    offScreen.transitTo = 5;
    expect(
      updateButterflyResidency({
        motion: offScreen,
        position,
        velocity,
        roaming: true,
        residents,
        cameraX: unitCenterX(5),
        rehomingMargin: 12,
        step: 1 / 60,
        time: 4,
      }),
    ).toBe("rehomed");
    expect(offScreen.currentUnit).toBe(5);
    expect(offScreen.rehomedAt).toBe(4);
    expect(insectFlightVolumeContains(UNIT_FLIGHT_VOLUMES[5]!, position)).toBe(
      true,
    );
  });

  it("leaves a resident with a Landing Plan in the air exactly where it is", () => {
    const motion = createButterflyMotion(11, 2);
    motion.transitTo = 5;
    const position = worldPoint(2, [
      BUTTERFLY_FLIGHT_VOLUME_EXTENT.halfWidth + 0.35,
      0.3,
      1.2,
    ]);
    const residents = [6, 2, 6, 2, 2, 2, 1];

    expect(
      updateButterflyResidency({
        motion,
        position,
        velocity: { x: 1, y: 0, z: 0 },
        roaming: false,
        residents,
        cameraX: unitCenterX(6),
        rehomingMargin: 0,
        step: 1 / 60,
        time: 2,
      }),
    ).toBe("none");
    expect(motion.currentUnit).toBe(2);
    expect(motion.transitTo).toBeNull();
  });
});
