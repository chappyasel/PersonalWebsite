// Residency: which Unit's air a butterfly belongs to right now, and how that
// changes (ADR 0004).
//
// ADR 0003 gave every resident one Unit for the life of the page. Three
// butterflies per shelf, never crossing, is legible as an implementation within
// seconds of watching, so Residency became a thing an insect can lose. The
// three mechanisms here are deliberately different in kind:
//
//   Migration   an ordinary boundary crossing. The insect flies across a shared
//               face under its own wander and is adopted when the neighbour
//               contains it. Probability is weighted toward the camera; the
//               insect itself never knows where the camera is.
//   Transit     a directed crossing at raised speed for an insect near or in
//               frame, when redistribution needs to happen faster than drift.
//   Re-homing   the same position write that used to be the teleport bug, made
//               legitimate by only ever firing while the insect is provably
//               outside every view the camera can produce.
//
// Everything is expressed against a per-frame DEMAND — how many residents each
// Unit should hold given where the camera is — rather than against an authored
// arrangement, because the arrangement has to follow a continuously moving
// viewer.
import { UNIT_COUNT } from "../data";

import type { InsectContainment } from "./insectContainment";
import {
  BUTTERFLY_FLIGHT_VOLUME_EXTENT,
  type InsectFlightVolume,
  createInsectFlightVolume,
  createInsectFlightVolumeContainment,
  insectFlightVolumeContains,
  insectFlightVolumeDirection,
  insectFlightVolumeLocal,
  insectFlightVolumeLocalDirection,
  insectFlightVolumePoint,
} from "./insectFlightVolume";
import { CAMERA_LOOK_X_MAX_LAG, UNIT_SPACING, unitPose } from "./worldLayout";

/**
 * One Flight Volume per Unit, tiled edge to edge, with every shared lateral
 * face opened by the handoff band. The room's two outer faces stay closed —
 * there is no neighbour past unit 0 or unit 6 to be handed to.
 */
export const UNIT_FLIGHT_VOLUMES: readonly InsectFlightVolume[] = Array.from(
  { length: UNIT_COUNT },
  (_, unit) =>
    createInsectFlightVolume(unitPose(unit), BUTTERFLY_FLIGHT_VOLUME_EXTENT, {
      minX: unit > 0,
      maxX: unit < UNIT_COUNT - 1,
    }),
);

/**
 * One containment adapter per Unit, shared by whoever currently lives there.
 * They are stateless, so Residency is which of these seven an insect holds —
 * not a per-insect object that would have to be kept in sync.
 */
export const UNIT_FLIGHT_CONTAINMENTS: readonly InsectContainment[] =
  UNIT_FLIGHT_VOLUMES.map(createInsectFlightVolumeContainment);

export const BUTTERFLY_RESIDENCY = {
  /**
   * Nobody's shelf empties behind them. Without a floor, a viewer who scrolls
   * away and glances back is taught the rule in one move — which is exactly
   * what camera weighting is trying to hide.
   */
  minPerUnit: 2,
  /**
   * ...and nobody's shelf becomes a swarm. With 21 residents, a floor of 2 and
   * a cap of 6 produce the authored target directly: about six in the Unit in
   * view, three in its neighbours, two at the far end.
   */
  maxPerUnit: 6,
  /** Metres of camera x over which the migration bias decays. One Unit. */
  cameraFalloff: UNIT_SPACING,
  /**
   * Hazard rate, per second, for a migration that is entirely favourable. Bias
   * scales it down toward zero for a crossing that moves away from the viewer,
   * so an unfavourable crossing is not forbidden — only slow.
   */
  migrationRate: 1.4,
  /**
   * Depth behind the camera plane the deepest resident can reach: the rear of
   * a Flight Volume (−1.4 local) behind the rearmost Unit origin (−0.55).
   * Used to size the re-homing margin at the worst-case insect depth.
   */
  farInsectDepth: 1.95,
  /**
   * Slop on the computed visible half-width. Cheap x-distance testing cannot
   * know that a Unit's own yaw carries local z into world x, nor that a
   * viewport is mid-resize; being wrong here shows a butterfly jumping the
   * room, so the margin is bought generously.
   */
  marginSafety: 1.25,
} as const;

export const unitCenterX = (unit: number) => unit * UNIT_SPACING;

/**
 * How many residents each Unit should hold, given where the camera is.
 *
 * Every Unit starts at the floor; the remainder is handed out one resident at
 * a time by a divisor method over a camera-distance weight, which is stable
 * under a continuously moving camera in a way that rounding a proportion is
 * not — a target that flickers between 3 and 4 as the camera drifts would
 * order a crossing and then immediately order it back.
 */
export function butterflyResidencyDemand(
  cameraX: number,
  total: number,
  unitCount = UNIT_COUNT,
): number[] {
  const demand = new Array<number>(unitCount).fill(
    Math.min(BUTTERFLY_RESIDENCY.minPerUnit, Math.floor(total / unitCount)),
  );
  const weights = demand.map((_, unit) =>
    Math.exp(
      -Math.abs(unitCenterX(unit) - cameraX) /
        BUTTERFLY_RESIDENCY.cameraFalloff,
    ),
  );
  let assigned = demand.reduce((sum, value) => sum + value, 0);
  while (assigned < total) {
    let best = -1;
    let bestScore = -1;
    for (let unit = 0; unit < unitCount; unit++) {
      if (demand[unit]! >= BUTTERFLY_RESIDENCY.maxPerUnit) continue;
      const score = weights[unit]! / (demand[unit]! + 1);
      // Ties break toward the camera, then toward the lower index, so the
      // arrangement is a function of camera x alone and never of frame order.
      if (
        score > bestScore + 1e-12 ||
        (Math.abs(score - bestScore) <= 1e-12 &&
          best >= 0 &&
          Math.abs(unitCenterX(unit) - cameraX) <
            Math.abs(unitCenterX(best) - cameraX))
      ) {
        best = unit;
        bestScore = score;
      }
    }
    if (best < 0) break;
    demand[best]! += 1;
    assigned += 1;
  }
  return demand;
}

/**
 * 0..1 — how much a crossing from `fromUnit` to `toUnit` is favoured, given the
 * camera. Exactly 0.5 when both Units are equidistant, above it when the
 * crossing moves toward the viewer.
 *
 * This is the ONLY place the camera enters an insect's life. A per-insect
 * attraction force was rejected: it produces "the butterflies want me", which
 * is a different and much worse illusion than "there are more butterflies here"
 * (ADR 0004).
 */
export function butterflyMigrationBias(
  fromUnit: number,
  toUnit: number,
  cameraX: number,
) {
  const from = Math.exp(
    -Math.abs(unitCenterX(fromUnit) - cameraX) /
      BUTTERFLY_RESIDENCY.cameraFalloff,
  );
  const to = Math.exp(
    -Math.abs(unitCenterX(toUnit) - cameraX) /
      BUTTERFLY_RESIDENCY.cameraFalloff,
  );
  const total = from + to;
  return total > 0 ? to / total : 0.5;
}

/**
 * The neighbouring Unit whose volume already contains `position`, or null.
 *
 * Membership is the strict authored extent, never the handoff band: an insect
 * inside the band is still short of the seam and still belongs where it was.
 * Once it is past, the neighbour contains it and the handoff moves nothing,
 * which is the whole reason the volumes were made to tile.
 */
export function butterflyMigrationCandidate(
  currentUnit: number,
  position: { x: number; y: number; z: number },
  unitCount = UNIT_COUNT,
): number | null {
  for (const unit of [currentUnit - 1, currentUnit + 1]) {
    if (unit < 0 || unit >= unitCount) continue;
    const volume = UNIT_FLIGHT_VOLUMES[unit];
    if (volume && insectFlightVolumeContains(volume, position)) return unit;
  }
  return null;
}

/** Whether the population would still be legal after this crossing. */
export function butterflyMigrationIsPermitted(
  residents: readonly number[],
  fromUnit: number,
  toUnit: number,
) {
  return (
    (residents[fromUnit] ?? 0) > BUTTERFLY_RESIDENCY.minPerUnit &&
    (residents[toUnit] ?? 0) < BUTTERFLY_RESIDENCY.maxPerUnit
  );
}

/**
 * Half-width of the strip of room the camera could possibly be showing, plus
 * the look lag, computed from the live camera.
 *
 * An authored constant cannot do this job. At 16:9 the worst case is about
 * eleven metres; at aspect 3.0 it is close to fifteen, against a room 26.4 m
 * wide. A constant is therefore either unsafe on an ultrawide display or
 * useless on an ordinary one (ADR 0004).
 */
export function butterflyRehomingMargin(camera: {
  fov: number;
  aspect: number;
  z: number;
}) {
  const halfVertical = ((camera.fov / 2) * Math.PI) / 180;
  const tanHorizontal = Math.tan(halfVertical) * Math.max(0.01, camera.aspect);
  const depth = Math.max(0.1, camera.z) + BUTTERFLY_RESIDENCY.farInsectDepth;
  return (
    depth * tanHorizontal * BUTTERFLY_RESIDENCY.marginSafety +
    CAMERA_LOOK_X_MAX_LAG
  );
}

/** Whether `position` is far enough from the camera in x that re-homing it
 * cannot be seen, at any look lag the rig can produce. */
export function butterflyIsOutOfFrame(
  position: { x: number },
  cameraX: number,
  margin: number,
) {
  return Math.abs(position.x - cameraX) > margin;
}

const LOCAL = { x: 0, y: 0, z: 0 };

/**
 * Move a position and its velocity from one Unit's frame into another's,
 * preserving Unit-local coordinates.
 *
 * This is a hard position write — the same one that was the teleport bug. It is
 * only legitimate behind `butterflyIsOutOfFrame`; nothing else in the system
 * may call it.
 */
export function relocateInsectBetweenUnits(
  fromUnit: number,
  toUnit: number,
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
) {
  const from = UNIT_FLIGHT_VOLUMES[fromUnit];
  const to = UNIT_FLIGHT_VOLUMES[toUnit];
  if (!from || !to) return false;
  insectFlightVolumeLocal(from, position, LOCAL);
  insectFlightVolumePoint(to, LOCAL, position);
  insectFlightVolumeLocalDirection(from, velocity, LOCAL);
  insectFlightVolumeDirection(to, LOCAL, velocity);
  return true;
}

/**
 * The next Unit a resident should be steered toward, or null when it is
 * already where it belongs.
 *
 * Surplus and deficit are read off the live demand rather than a schedule, so
 * an insect that is overtaken by the camera mid-crossing simply stops being
 * surplus and keeps its new home.
 */
export function butterflyTransitDestination(
  residents: readonly number[],
  demand: readonly number[],
  currentUnit: number,
): number | null {
  if ((residents[currentUnit] ?? 0) <= (demand[currentUnit] ?? 0)) return null;
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let unit = 0; unit < residents.length; unit++) {
    if (unit === currentUnit) continue;
    if ((residents[unit] ?? 0) >= (demand[unit] ?? 0)) continue;
    const distance = Math.abs(unit - currentUnit);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = unit;
    }
  }
  return best;
}

const TRANSIT_TARGET = { x: 0, y: 0, z: 0 };

/**
 * World-space unit direction for a directed crossing, written into `out`.
 *
 * It aims at the camera-side half of the destination volume rather than at the
 * Unit origin, because the origin is inside a 2.6 m wall of shelf: a heading
 * that points through the planks spends the whole crossing being bent by
 * repulsion, which is exactly the "changed its mind" quality Transit exists to
 * avoid. Height is carried across unchanged so a crossing does not also become
 * a climb.
 */
export function butterflyTransitDirection(
  position: { x: number; y: number; z: number },
  toUnit: number,
  out: { x: number; y: number; z: number },
) {
  const volume = UNIT_FLIGHT_VOLUMES[toUnit];
  if (!volume) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return false;
  }
  const extent = volume.extent;
  TRANSIT_TARGET.x = 0;
  TRANSIT_TARGET.y = Math.min(extent.maxY, Math.max(extent.minY, position.y));
  TRANSIT_TARGET.z = Math.min(extent.maxZ, extent.frontZ + 0.6);
  insectFlightVolumePoint(volume, TRANSIT_TARGET, TRANSIT_TARGET);
  out.x = TRANSIT_TARGET.x - position.x;
  out.y = TRANSIT_TARGET.y - position.y;
  out.z = TRANSIT_TARGET.z - position.z;
  const length = Math.hypot(out.x, out.y, out.z);
  if (length < 1e-6) return false;
  out.x /= length;
  out.y /= length;
  out.z /= length;
  return true;
}
