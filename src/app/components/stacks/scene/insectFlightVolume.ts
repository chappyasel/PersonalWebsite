// The Flight Volume: the Unit-local region of air a roaming insect may
// occupy. It is an authored extent, not a topology — there are no nodes, no
// edges, and no portals. Membership is expressed as a containment force, so an
// insect drifting past a shelf end is turned by a gradient rather than routed
// through a transition, and going around the furniture is a consequence of the
// geometry instead of an authored move.
//
// Everything here is in the Unit's own frame and converted at the boundary,
// because the seven Units are spaced along x with alternating yaw and depth
// (see `unitPose`): authoring one extent in world coordinates would make six
// of them wrong.
import type { CollisionPoint } from "./insectCollision";
import type { InsectContainment } from "./insectContainment";

export type InsectFlightVolumeExtent = Readonly<{
  /** Half-width across the Unit face. The shelf itself is 2.64 wide. */
  halfWidth: number;
  /** Absolute world heights; the whole scene shares one ground plane. */
  minY: number;
  maxY: number;
  /** Unit-local depth. Positive is toward the camera. */
  minZ: number;
  maxZ: number;
  /** Local z where the camera-side half begins. */
  frontZ: number;
  /**
   * How hard a resident behind `frontZ` leans its wander toward the camera
   * side, as a multiple of the wander radius. This is what produces the
   * authored front/rear residency split without giving anyone a destination:
   * an insect in the rear intends to come forward, an insect already forward
   * is left alone, and the front boundary turns it back.
   */
  residencyDrift: number;
  /** Distance over which containment ramps in ahead of each boundary. */
  margin: number;
  /**
   * How far past a SHARED lateral face a resident may stray before that face
   * starts turning it back (ADR 0004).
   *
   * Tiled volumes meet edge to edge, so without this the two boundaries are
   * coincident and no insect ever gets to be inside both at once — migration
   * would have to fire while the insect was still short of the seam, leaving
   * it outside its new volume and letting the clamp hard-write it back. That
   * is the teleport. Opening the shared face by a handoff band instead means
   * an insect crosses the seam under ordinary wander, is adopted the moment
   * the neighbour contains it, and nothing moves.
   *
   * Room-end faces are never opened: unit 0's −x and unit 6's +x have no
   * neighbour to hand anyone to.
   *
   * The value is bracketed on both sides. It must exceed the worst measured
   * adoption depth — the volumes tile in x but the Units alternate yaw and
   * depth, so a neighbour does not contain a point the instant it crosses the
   * authored face; across the band of z where residents actually fly, the
   * deepest is 0.50 m. And it must stay under 0.88 m, which is the clear air
   * between a seam and the NEXT shelf's edge, because a resident this far out
   * is still sampling its own Unit's collision index and must not be able to
   * reach geometry that index does not contain.
   */
  handoff: number;
}>;

/**
 * Authored for the butterflies, and the single highest-leverage number in the
 * insect system: the two rejected implementations both flew inside the 21 cm
 * gap between the shelf planks, which is dead air with no vertical travel in
 * it. This spans from just above the flower heads (≈ −1.05) to well above the
 * tallest authored Perch (+1.00) — with room above it for that Perch's own
 * arrival apex, which the first version of this number did not have, leaving
 * the About portrait 1 cm out of reach — and reaches a full two metres toward
 * the camera so most flight happens in front of the furniture rather than
 * behind it. Review it whenever a Unit gains a taller prop.
 *
 * `halfWidth` is exactly half of `UNIT_SPACING` (4.4) so consecutive volumes
 * TILE. It was 2.0, which left a 0.4 m band of air belonging to nobody between
 * every pair of shelves — nothing could cross it even in principle, which is
 * what made the room read as seven aquariums (ADR 0004).
 */
export const BUTTERFLY_FLIGHT_VOLUME_EXTENT: InsectFlightVolumeExtent = {
  halfWidth: 2.2,
  minY: -0.95,
  maxY: 1.45,
  minZ: -1.4,
  maxZ: 2.4,
  frontZ: 0.45,
  residencyDrift: 2.2,
  margin: 0.5,
  handoff: 0.75,
};

export type InsectFlightVolume = Readonly<{
  extent: InsectFlightVolumeExtent;
  originX: number;
  originZ: number;
  /** Precomputed yaw basis so the hot path never calls a trig function. */
  cos: number;
  sin: number;
  /** Lateral faces that a neighbouring volume shares, opened by
   * `extent.handoff`. Local −x is the lower Unit index, +x the higher. */
  openMinX: boolean;
  openMaxX: boolean;
}>;

/** Which lateral faces of a Unit's volume are shared with a neighbour. */
export type InsectFlightVolumeNeighbours = Readonly<{
  minX?: boolean;
  maxX?: boolean;
}>;

export type InsectUnitPose = Readonly<{
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
}>;

export function createInsectFlightVolume(
  pose: InsectUnitPose,
  extent: InsectFlightVolumeExtent = BUTTERFLY_FLIGHT_VOLUME_EXTENT,
  neighbours: InsectFlightVolumeNeighbours = {},
): InsectFlightVolume {
  const yaw = pose.rotation[1];
  return {
    extent,
    originX: pose.position[0],
    originZ: pose.position[2],
    cos: Math.cos(yaw),
    sin: Math.sin(yaw),
    openMinX: Boolean(neighbours.minX),
    openMaxX: Boolean(neighbours.maxX),
  };
}

/** The lateral bounds containment and the clamp actually enforce: the authored
 * half-width, plus the handoff band on whichever faces a neighbour shares.
 * `insectFlightVolumeContains` deliberately does NOT use these — membership is
 * the residency partition, and it stays exactly at the authored face. */
const lateralMin = (volume: InsectFlightVolume) =>
  -volume.extent.halfWidth - (volume.openMinX ? volume.extent.handoff : 0);
const lateralMax = (volume: InsectFlightVolume) =>
  volume.extent.halfWidth + (volume.openMaxX ? volume.extent.handoff : 0);

/** World point into the Unit's own frame. Matches the Unit group transform. */
export function insectFlightVolumeLocal(
  volume: InsectFlightVolume,
  point: CollisionPoint,
  out: { x: number; y: number; z: number },
) {
  const dx = point.x - volume.originX;
  const dz = point.z - volume.originZ;
  out.x = dx * volume.cos - dz * volume.sin;
  out.y = point.y;
  out.z = dx * volume.sin + dz * volume.cos;
}

export function insectFlightVolumePoint(
  volume: InsectFlightVolume,
  local: CollisionPoint,
  out: { x: number; y: number; z: number },
) {
  // Read both components before writing either: callers legitimately pass the
  // same object as input and output.
  const x = volume.originX + local.x * volume.cos + local.z * volume.sin;
  const z = volume.originZ - local.x * volume.sin + local.z * volume.cos;
  out.x = x;
  out.y = local.y;
  out.z = z;
}

/** World direction into the Unit's own frame. */
export function insectFlightVolumeLocalDirection(
  volume: InsectFlightVolume,
  direction: CollisionPoint,
  out: { x: number; y: number; z: number },
) {
  const x = direction.x * volume.cos - direction.z * volume.sin;
  const z = direction.x * volume.sin + direction.z * volume.cos;
  out.x = x;
  out.y = direction.y;
  out.z = z;
}

/** Directions rotate but never translate. Alias-safe, as above. */
export function insectFlightVolumeDirection(
  volume: InsectFlightVolume,
  local: CollisionPoint,
  out: { x: number; y: number; z: number },
) {
  const x = local.x * volume.cos + local.z * volume.sin;
  const z = -local.x * volume.sin + local.z * volume.cos;
  out.x = x;
  out.y = local.y;
  out.z = z;
}

export function insectFlightVolumeContains(
  volume: InsectFlightVolume,
  point: CollisionPoint,
  slack = 0,
) {
  const extent = volume.extent;
  const dx = point.x - volume.originX;
  const dz = point.z - volume.originZ;
  const localX = dx * volume.cos - dz * volume.sin;
  const localZ = dx * volume.sin + dz * volume.cos;
  return (
    Math.abs(localX) <= extent.halfWidth + slack &&
    point.y >= extent.minY - slack &&
    point.y <= extent.maxY + slack &&
    localZ >= extent.minZ - slack &&
    localZ <= extent.maxZ + slack
  );
}

/** Which half of the Unit's air a point sits in. Residency telemetry only. */
export function insectFlightVolumeRegion(
  volume: InsectFlightVolume,
  point: CollisionPoint,
): "front" | "rear" {
  const dx = point.x - volume.originX;
  const dz = point.z - volume.originZ;
  return dx * volume.sin + dz * volume.cos >= volume.extent.frontZ
    ? "front"
    : "rear";
}

const LOCAL = { x: 0, y: 0, z: 0 };
const LOCAL_FORCE = { x: 0, y: 0, z: 0 };

/** One axis of containment: zero deep inside, ramping quadratically across the
 * margin, and linear past the boundary so no overshoot can escape. */
function axisContainment(
  value: number,
  min: number,
  max: number,
  margin: number,
) {
  const below = min + margin - value;
  if (below > 0) {
    const ramp = Math.min(1, below / margin);
    return ramp * ramp + Math.max(0, -(value - min)) * 4;
  }
  const above = value - (max - margin);
  if (above > 0) {
    const ramp = Math.min(1, above / margin);
    return -(ramp * ramp) - Math.max(0, value - max) * 4;
  }
  return 0;
}

/**
 * Write the world-space inward containment vector for `point` into `out`, and
 * return 0..1 for how hard the boundary is pushing (which the HUD reports).
 *
 * The vector is deliberately not a force. Applying it as one does not work: the
 * Intent Layer drives velocity toward an isotropic wander heading with a 0.4 s
 * time constant, so any inward velocity a wall force buys is erased as soon as
 * the insect clears the margin, and residents settle into a shell hugging the
 * boundary. The caller instead folds this into the intended heading, so the
 * insect means to come back rather than being pushed.
 */
export function insectFlightVolumeContainment(
  volume: InsectFlightVolume,
  point: CollisionPoint,
  out: { x: number; y: number; z: number },
) {
  const extent = volume.extent;
  insectFlightVolumeLocal(volume, point, LOCAL);
  LOCAL_FORCE.x = axisContainment(
    LOCAL.x,
    lateralMin(volume),
    lateralMax(volume),
    extent.margin,
  );
  LOCAL_FORCE.y = axisContainment(
    LOCAL.y,
    extent.minY,
    extent.maxY,
    extent.margin,
  );
  LOCAL_FORCE.z = axisContainment(
    LOCAL.z,
    extent.minZ,
    extent.maxZ,
    extent.margin,
  );
  const severity = Math.min(
    1,
    Math.hypot(LOCAL_FORCE.x, LOCAL_FORCE.y, LOCAL_FORCE.z),
  );
  insectFlightVolumeDirection(volume, LOCAL_FORCE, out);
  return severity;
}

/**
 * The camera-side lean: a world-space unit direction written into `out`, and
 * its strength returned. Full strength at the back of the volume, fading to
 * nothing at `frontZ` so front-half residents are never pressed into the front
 * wall.
 *
 * This is deliberately a bias on INTENT rather than a force. A shelf is an
 * unbroken 2.6 m wall; a constant forward shove drives whatever is behind it
 * into the back of a plank and pins it there, which makes the rear stickier
 * rather than emptier. A lean on the intended heading is bent by that same
 * plank's repulsion into travel along the wall, which carries the insect to an
 * open end. Going around the shelf falls out of the gradient rather than being
 * an authored transition.
 */
export function insectFlightVolumeResidencyDrift(
  volume: InsectFlightVolume,
  point: CollisionPoint,
  out: { x: number; y: number; z: number },
) {
  const extent = volume.extent;
  insectFlightVolumeLocal(volume, point, LOCAL);
  const behind = extent.frontZ - LOCAL.z;
  out.x = volume.sin;
  out.y = 0;
  out.z = volume.cos;
  if (behind <= 0) return 0;
  return (
    extent.residencyDrift *
    Math.min(1, behind / Math.max(1e-6, extent.frontZ - extent.minZ))
  );
}

const LOCAL_VELOCITY = { x: 0, y: 0, z: 0 };

/**
 * Last-resort projection back inside the volume plus `slack`, removing only
 * the outward component of the velocity on whichever axes actually clamped.
 *
 * Removing the whole velocity instead makes the boundary sticky: an insect
 * that touches it loses all its speed, needs half a second to build any back,
 * and spends that time pressed against the wall. Containment is meant to do
 * this job before the clamp ever sees it; this is only here so a pathological
 * force stack cannot park an insect in the soil or behind the horizon.
 */
export function clampToInsectFlightVolume(
  volume: InsectFlightVolume,
  point: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  slack: number,
) {
  const extent = volume.extent;
  insectFlightVolumeLocal(volume, point, LOCAL);
  const clampedX = Math.min(
    lateralMax(volume) + slack,
    Math.max(lateralMin(volume) - slack, LOCAL.x),
  );
  const clampedY = Math.min(
    extent.maxY + slack,
    Math.max(extent.minY - slack, LOCAL.y),
  );
  const clampedZ = Math.min(
    extent.maxZ + slack,
    Math.max(extent.minZ - slack, LOCAL.z),
  );
  if (clampedX === LOCAL.x && clampedY === LOCAL.y && clampedZ === LOCAL.z)
    return false;
  insectFlightVolumeLocalDirection(volume, velocity, LOCAL_VELOCITY);
  if (
    clampedX !== LOCAL.x &&
    Math.sign(LOCAL_VELOCITY.x) === Math.sign(LOCAL.x)
  )
    LOCAL_VELOCITY.x = 0;
  if (clampedY !== LOCAL.y)
    LOCAL_VELOCITY.y =
      LOCAL.y > clampedY
        ? Math.min(0, LOCAL_VELOCITY.y)
        : Math.max(0, LOCAL_VELOCITY.y);
  if (clampedZ !== LOCAL.z)
    LOCAL_VELOCITY.z =
      LOCAL.z > clampedZ
        ? Math.min(0, LOCAL_VELOCITY.z)
        : Math.max(0, LOCAL_VELOCITY.z);
  insectFlightVolumeDirection(volume, LOCAL_VELOCITY, velocity);
  LOCAL.x = clampedX;
  LOCAL.y = clampedY;
  LOCAL.z = clampedZ;
  insectFlightVolumePoint(volume, LOCAL, point);
  return true;
}

/**
 * The Flight Volume as an `InsectContainment`.
 *
 * Stateless and therefore shareable: the three functions it wraps write only
 * into module scratch vectors and their `out` argument, so one adapter per Unit
 * serves every resident currently living there. Migration (ADR 0004) hands an
 * insect a different adapter rather than mutating the one it holds, which is
 * what keeps a handoff from being visible to anyone else in the same volume.
 */
export function createInsectFlightVolumeContainment(
  volume: InsectFlightVolume,
): InsectContainment {
  return {
    containment: (point, out) =>
      insectFlightVolumeContainment(volume, point, out),
    residencyDrift: (point, out) =>
      insectFlightVolumeResidencyDrift(volume, point, out),
    clamp: (position, velocity, slack) =>
      clampToInsectFlightVolume(volume, position, velocity, slack),
  };
}
