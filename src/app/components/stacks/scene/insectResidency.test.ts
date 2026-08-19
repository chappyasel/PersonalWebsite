// Residency is a distribution, not a path, so what these bound is the shape of
// the distribution and the safety of the two mechanisms that produce it. The
// re-homing margin gets the most attention here for one reason: re-homing is
// literally the teleport bug, and the margin is the only thing separating them.
import { UNIT_COUNT } from "../data";
import { describe, expect, it } from "vitest";

import {
  BUTTERFLY_FLIGHT_VOLUME_EXTENT,
  insectFlightVolumeContains,
  insectFlightVolumeLocal,
  insectFlightVolumePoint,
} from "./insectFlightVolume";
import {
  BUTTERFLY_RESIDENCY,
  UNIT_FLIGHT_VOLUMES,
  butterflyIsOutOfFrame,
  butterflyMigrationBias,
  butterflyMigrationCandidate,
  butterflyMigrationIsPermitted,
  butterflyRehomingMargin,
  butterflyResidencyDemand,
  butterflyTransitDestination,
  butterflyTransitDirection,
  relocateInsectBetweenUnits,
  unitCenterX,
} from "./insectResidency";
import { CAMERA, CAMERA_LOOK_X_MAX_LAG, UNIT_SPACING } from "./worldLayout";

const TOTAL = 21;

describe("camera-weighted demand", () => {
  it("holds the floor everywhere and the cap nowhere but the Unit in view", () => {
    for (let unit = 0; unit < UNIT_COUNT; unit++) {
      const demand = butterflyResidencyDemand(unitCenterX(unit), TOTAL);
      expect(demand.reduce((sum, value) => sum + value, 0)).toBe(TOTAL);
      for (const value of demand) {
        expect(value).toBeGreaterThanOrEqual(BUTTERFLY_RESIDENCY.minPerUnit);
        expect(value).toBeLessThanOrEqual(BUTTERFLY_RESIDENCY.maxPerUnit);
      }
      expect(demand[unit]).toBe(BUTTERFLY_RESIDENCY.maxPerUnit);
    }
  });

  it("falls off monotonically with distance from the camera", () => {
    // The authored target: about six in the Unit in view, three in its
    // neighbours, two at the far end.
    const demand = butterflyResidencyDemand(unitCenterX(3), TOTAL);
    expect(demand[3]).toBe(6);
    expect(demand[2]).toBeGreaterThanOrEqual(3);
    expect(demand[4]).toBeGreaterThanOrEqual(3);
    expect(demand[0]).toBe(2);
    expect(demand[6]).toBe(2);
    for (let unit = 1; unit <= 3; unit++)
      expect(demand[unit]!).toBeGreaterThanOrEqual(demand[unit - 1]!);
    for (let unit = 3; unit < UNIT_COUNT - 1; unit++)
      expect(demand[unit]!).toBeGreaterThanOrEqual(demand[unit + 1]!);
  });

  it("moves continuously as the camera crosses a Unit boundary", () => {
    // The store changes `activeUnit` a handful of times per traverse; demand
    // is judged against the continuous camera x precisely so the population
    // does not move in seven steps.
    let changes = 0;
    let previous = butterflyResidencyDemand(0, TOTAL);
    for (let step = 1; step <= 44; step++) {
      const demand = butterflyResidencyDemand(step * 0.1, TOTAL);
      if (demand.some((value, unit) => value !== previous[unit])) changes++;
      previous = demand;
    }
    expect(changes).toBeGreaterThan(1);
  });
});

describe("migration bias", () => {
  it("favours the crossing that moves toward the viewer, and never forbids one", () => {
    const towards = butterflyMigrationBias(0, 1, unitCenterX(3));
    const away = butterflyMigrationBias(1, 0, unitCenterX(3));

    expect(towards).toBeGreaterThan(0.5);
    expect(away).toBeLessThan(0.5);
    expect(away).toBeGreaterThan(0);
    expect(towards + away).toBeCloseTo(1, 9);
    expect(butterflyMigrationBias(2, 4, unitCenterX(3))).toBeCloseTo(0.5, 9);
  });

  it("keeps a floor under the Unit being left and a cap over the one entered", () => {
    const residents = [2, 6, 3, 3, 2, 3, 2];
    expect(butterflyMigrationIsPermitted(residents, 0, 2)).toBe(false);
    expect(butterflyMigrationIsPermitted(residents, 2, 1)).toBe(false);
    expect(butterflyMigrationIsPermitted(residents, 2, 3)).toBe(true);
  });
});

describe("migration candidate", () => {
  const worldPoint = (unit: number, localX: number) => {
    const out = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(
      UNIT_FLIGHT_VOLUMES[unit]!,
      { x: localX, y: 0.2, z: 1.2 },
      out,
    );
    return out;
  };

  it("adopts only once the neighbour actually contains the insect", () => {
    const extent = BUTTERFLY_FLIGHT_VOLUME_EXTENT;
    // Inside the handoff band but still short of the seam: nobody moves.
    expect(
      butterflyMigrationCandidate(3, worldPoint(3, extent.halfWidth - 0.05)),
    ).toBeNull();
    // Past it: the neighbour contains the insect, so the handoff moves nothing.
    const across = worldPoint(3, extent.halfWidth + 0.25);
    expect(butterflyMigrationCandidate(3, across)).toBe(4);
    expect(insectFlightVolumeContains(UNIT_FLIGHT_VOLUMES[4]!, across)).toBe(
      true,
    );
  });

  it("is reachable from inside the handoff band, across the band residents fly", () => {
    // The Units alternate yaw and depth, so consecutive volumes tile in x but
    // not exactly: a neighbour does not contain a point the instant it crosses
    // the authored face. What has to hold is that adoption happens BEFORE the
    // handoff band runs out, or a resident would be turned back at a seam it
    // could never cross. It fails at the extreme front and rear of the volume,
    // which is honest and harmless — those are the last 30 cm of depth, and
    // the resident simply crosses somewhere else.
    const extent = BUTTERFLY_FLIGHT_VOLUME_EXTENT;
    let deepest = 0;
    for (let unit = 0; unit < UNIT_COUNT - 1; unit++) {
      for (const direction of [1, -1]) {
        const neighbour = direction === 1 ? unit + 1 : unit;
        const home = direction === 1 ? unit : unit + 1;
        for (let z = -0.7; z <= 1.8; z += 0.1) {
          for (const y of [extent.minY + 0.01, 0.2, extent.maxY - 0.01]) {
            let depth: number | null = null;
            const point = { x: 0, y: 0, z: 0 };
            for (let step = 0; step <= 40; step++) {
              const stray = step * 0.02;
              insectFlightVolumePoint(
                UNIT_FLIGHT_VOLUMES[home]!,
                { x: direction * (extent.halfWidth + stray), y, z },
                point,
              );
              if (
                insectFlightVolumeContains(
                  UNIT_FLIGHT_VOLUMES[neighbour]!,
                  point,
                )
              ) {
                depth = stray;
                break;
              }
            }
            expect(depth, `${home} -> ${neighbour} at z ${z}`).not.toBeNull();
            deepest = Math.max(deepest, depth!);
          }
        }
      }
    }
    expect(deepest).toBeLessThan(extent.handoff);
    // ...and the band itself must stay clear of the NEXT shelf's edge, which a
    // resident this far out is not sampling collision against.
    expect(extent.handoff).toBeLessThan(UNIT_SPACING - extent.halfWidth - 1.32);
  });

  it("has nothing to hand a resident to at either end of the room", () => {
    const extent = BUTTERFLY_FLIGHT_VOLUME_EXTENT;
    expect(
      butterflyMigrationCandidate(0, worldPoint(0, -extent.halfWidth - 0.25)),
    ).toBeNull();
    expect(
      butterflyMigrationCandidate(
        UNIT_COUNT - 1,
        worldPoint(UNIT_COUNT - 1, extent.halfWidth + 0.25),
      ),
    ).toBeNull();
  });
});

describe("re-homing", () => {
  it("derives a margin no authored constant could cover", () => {
    const wide = butterflyRehomingMargin({
      fov: CAMERA.fov,
      aspect: 16 / 9,
      z: CAMERA.z,
    });
    const ultrawide = butterflyRehomingMargin({
      fov: CAMERA.fov,
      aspect: 3,
      z: CAMERA.z,
    });

    expect(wide).toBeGreaterThan(CAMERA_LOOK_X_MAX_LAG);
    expect(ultrawide).toBeGreaterThan(wide);
    // A constant safe at aspect 3.0 would be most of the 26.4 m room, which is
    // why this is computed from the live camera every frame (ADR 0004).
    expect(ultrawide - wide).toBeGreaterThan(UNIT_SPACING / 2);
  });

  it("never permits a re-home that could be on screen", () => {
    const margin = butterflyRehomingMargin({
      fov: CAMERA.fov,
      aspect: 16 / 9,
      z: CAMERA.z,
    });
    const cameraX = unitCenterX(3);

    expect(butterflyIsOutOfFrame({ x: cameraX }, cameraX, margin)).toBe(false);
    expect(
      butterflyIsOutOfFrame(
        { x: cameraX + CAMERA_LOOK_X_MAX_LAG },
        cameraX,
        margin,
      ),
    ).toBe(false);
    expect(butterflyIsOutOfFrame({ x: 0 }, cameraX, margin)).toBe(true);
  });

  it("preserves Unit-local placement, so the insect arrives where it left", () => {
    const local = { x: 1.1, y: 0.3, z: 1.4 };
    const position = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(UNIT_FLIGHT_VOLUMES[0]!, local, position);
    const velocity = { x: 0.4, y: 0.05, z: -0.2 };
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);

    expect(relocateInsectBetweenUnits(0, 5, position, velocity)).toBe(true);
    const arrived = { x: 0, y: 0, z: 0 };
    insectFlightVolumeLocal(UNIT_FLIGHT_VOLUMES[5]!, position, arrived);
    expect(arrived.x).toBeCloseTo(local.x, 9);
    expect(arrived.y).toBeCloseTo(local.y, 9);
    expect(arrived.z).toBeCloseTo(local.z, 9);
    // Yaw differs between Units, so the velocity rotates; its speed must not.
    expect(Math.hypot(velocity.x, velocity.y, velocity.z)).toBeCloseTo(
      speed,
      9,
    );
    expect(insectFlightVolumeContains(UNIT_FLIGHT_VOLUMES[5]!, position)).toBe(
      true,
    );
  });
});

describe("transit", () => {
  it("sends only a surplus resident, and to the nearest deficit", () => {
    const residents = [2, 2, 5, 6, 3, 2, 1];
    const demand = [2, 2, 4, 6, 3, 2, 2];

    expect(butterflyTransitDestination(residents, demand, 3)).toBeNull();
    expect(butterflyTransitDestination(residents, demand, 2)).toBe(6);
    expect(butterflyTransitDestination(residents, demand, 0)).toBeNull();
  });

  it("aims at open air in front of the destination, never through the shelf", () => {
    const from = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(
      UNIT_FLIGHT_VOLUMES[0]!,
      { x: 0, y: 0.3, z: 1 },
      from,
    );
    const out = { x: 0, y: 0, z: 0 };
    expect(butterflyTransitDirection(from, 2, out)).toBe(true);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 9);
    expect(out.x).toBeGreaterThan(0.9);

    const arrival = {
      x: from.x + out.x * 100,
      y: from.y + out.y * 100,
      z: from.z + out.z * 100,
    };
    const local = { x: 0, y: 0, z: 0 };
    insectFlightVolumeLocal(UNIT_FLIGHT_VOLUMES[2]!, arrival, local);
    // The heading points at the camera side of the destination, not at its
    // origin — which is inside 2.6 m of shelf.
    expect(local.z).toBeGreaterThan(BUTTERFLY_FLIGHT_VOLUME_EXTENT.frontZ);
  });
});
