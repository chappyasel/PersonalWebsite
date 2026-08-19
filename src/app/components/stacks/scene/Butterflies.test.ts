import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  BUTTERFLIES_PER_UNIT,
  BUTTERFLY_COUNT,
  butterflyEscapeCause,
  butterflyFlightVolume,
  butterflyHomeUnit,
  butterflyIsActiveNeighbor,
  butterflyLandingPopulationLimit,
  butterflyPerchFailureMessage,
  butterflyStartPosition,
  butterflyTrailPoints,
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
import { UNIT_FLIGHT_VOLUMES, unitCenterX } from "./insectResidency";
import { registerSceneInteraction } from "./interactionRegistry";

describe("butterfly roaming state", () => {
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
      const motion = createButterflyMotion(index, butterflyHomeUnit(index));
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
  it("keeps three residents in every one of the seven Unit home ranges", () => {
    expect(BUTTERFLIES_PER_UNIT).toBe(3);
    expect(BUTTERFLY_COUNT).toBe(21);

    const residents = Array.from({ length: BUTTERFLY_COUNT }, (_, index) =>
      butterflyHomeUnit(index),
    );
    for (let unit = 0; unit < 7; unit++)
      expect(residents.filter((homeUnit) => homeUnit === unit)).toHaveLength(3);
  });

  it("judges active-neighbor eligibility on where a resident is now", () => {
    expect(butterflyIsActiveNeighbor(2, 1)).toBe(true);
    expect(butterflyIsActiveNeighbor(3, 1)).toBe(false);
    expect(butterflyIsActiveNeighbor(5, 6)).toBe(true);
  });

  it("selects exactly one available active-shelf resident for a force request", () => {
    // Index no longer implies Unit — Residency migrates — so the caller's
    // lookup is what decides who counts as a resident of the active shelf.
    const unitOf = (index: number) => (index === 2 || index === 19 ? 4 : 0);
    const attempted: number[] = [];
    const selected = selectForcedButterflyResident(4, unitOf, (index) => {
      attempted.push(index);
      return index === 19;
    });

    expect(selected).toBe(19);
    expect(attempted).toEqual([2, 19]);
    expect(selectForcedButterflyResident(4, unitOf, () => false)).toBeNull();
  });

  it("lets three butterflies hold the active shelf at once, in every window", () => {
    // The old quota returned one for three windows in four, across all
    // twenty-one residents, which is why most Perches were never used.
    for (const time of [0, 27, 84, 611])
      for (const forced of [false, true])
        expect(butterflyLandingPopulationLimit(time, forced)).toBe(3);
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
        // Everyone is where they should be, so nothing is surplus: this is
        // ordinary migration, not Transit.
        demand: balanced(),
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

  it("re-homes a surplus resident only while it is provably off screen", () => {
    const inFrame = createButterflyMotion(9, 0);
    const position = worldPoint(0, [0, 0.3, 1.2]);
    const velocity = { x: 0.2, y: 0, z: 0 };
    const residents = [6, 2, 2, 2, 3, 3, 3];
    const demand = [2, 2, 2, 2, 3, 6, 4];

    expect(
      updateButterflyResidency({
        motion: inFrame,
        position,
        velocity,
        roaming: true,
        residents,
        demand,
        cameraX: unitCenterX(0),
        rehomingMargin: 12,
        step: 1 / 60,
        time: 1,
      }),
    ).toBe("none");
    // Not re-homed, but under orders: Transit is the fallback that always
    // works when nothing may be moved for free.
    expect(inFrame.currentUnit).toBe(0);
    expect(inFrame.transitTo).toBe(5);

    const offScreen = createButterflyMotion(10, 0);
    expect(
      updateButterflyResidency({
        motion: offScreen,
        position,
        velocity,
        roaming: true,
        residents,
        demand,
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
        demand: [2, 2, 2, 2, 2, 2, 9],
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
