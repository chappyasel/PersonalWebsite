// The Lamp Cone: the region of air a moth belongs to (ADR 0007).
//
// A butterfly belongs to a region of the room; a moth belongs to a lamp. So the
// second `InsectContainment` shape is the lit cone of a practical — an axis, a
// depth band down it, and a radius that widens with depth — rather than a box
// in a Unit's frame.
//
// Softness is the feature here, not a tolerance. The moths carry a real
// illumination model that has never been able to show itself, because the path
// they flew was CONSTRUCTED bounded by the cone radius: a moth was
// mathematically incapable of leaving the light, so the only gradient anyone
// ever saw was the shallow interior one. Containing by intent, with a wide
// overshoot before anything hard happens, is what lets a moth drift proud of
// the beam, darken, and be drawn back.
//
// The cone is MUTABLE and updated from the live fixture each frame: a desk lamp
// is a prop the visitor can pick up, and its cone has to follow it.
import type { CollisionPoint } from "./insectCollision";
import type { ContainmentVector, InsectContainment } from "./insectContainment";

export type InsectLampCone = {
  /** The visible shade mouth the cone is emitted from. */
  sourceX: number;
  sourceY: number;
  sourceZ: number;
  /** Unit axis, pointing down the beam. */
  dirX: number;
  dirY: number;
  dirZ: number;
  /**
   * Camera-side radial axis. Moths lean toward it, which is what keeps them in
   * front of the fixture rather than orbiting behind the shade where nobody
   * can see them — the same job the sampled path did by construction, done as
   * a bias on intent instead.
   */
  forwardX: number;
  forwardY: number;
  forwardZ: number;
  /** Depth band down the axis the moths occupy. */
  nearDistance: number;
  farDistance: number;
  /** Radius at the far end. The cone narrows to 22% of it at the near end,
   * matching the drawn light. */
  maxRadius: number;
  /**
   * How far past the nominal cone intent alone may carry a moth before the
   * clamp exists at all. This is the whole of "drifting proud of the beam", so
   * it is authored as a multiple of the local radius rather than a distance —
   * a desk lamp's cone is a fifth of the floor lamp's and would otherwise
   * become a hard shell.
   */
  overshoot: number;
  /** Distance over which containment ramps in ahead of each boundary. */
  margin: number;
  /** How hard a moth behind the fixture leans toward the camera side, as a
   * multiple of the wander radius. */
  forwardDrift: number;
};

export const MOTH_LAMP_CONE_SHAPE = {
  /** Half again the local radius. Measured against nothing — it is authored to
   * be visibly generous, because a moth that never leaves the light is the
   * defect this exists to fix. */
  overshoot: 0.55,
  margin: 0.28,
  forwardDrift: 1.6,
} as const;

/** The cone's radius at `axial` metres down the beam. */
export function lampConeRadius(cone: InsectLampCone, axial: number) {
  const range = Math.max(0.001, cone.farDistance - cone.nearDistance);
  const t = Math.min(1, Math.max(0, (axial - cone.nearDistance) / range));
  return Math.max(0.001, cone.maxRadius * (0.22 + 0.78 * t));
}

export function createInsectLampCone(): InsectLampCone {
  return {
    sourceX: 0,
    sourceY: 0,
    sourceZ: 0,
    dirX: 0,
    dirY: -1,
    dirZ: 0,
    forwardX: 0,
    forwardY: 0,
    forwardZ: 1,
    nearDistance: 0.18,
    farDistance: 0.74,
    maxRadius: 0.72,
    ...MOTH_LAMP_CONE_SHAPE,
  };
}

export type LampConeLocal = {
  /** Distance down the beam from the source. */
  axial: number;
  /** Distance from the beam axis. */
  radial: number;
  /** Unit vector from the axis toward the point, or the forward axis when the
   * point is exactly on the axis. */
  outX: number;
  outY: number;
  outZ: number;
  /** Signed position along the camera-side radial axis. */
  forward: number;
};

export function createLampConeLocal(): LampConeLocal {
  return { axial: 0, radial: 0, outX: 0, outY: 0, outZ: 1, forward: 0 };
}

/** Resolve a world point into the cone's own axial/radial frame. */
export function lampConeLocal(
  cone: InsectLampCone,
  point: CollisionPoint,
  out: LampConeLocal,
): LampConeLocal {
  const dx = point.x - cone.sourceX;
  const dy = point.y - cone.sourceY;
  const dz = point.z - cone.sourceZ;
  const axial = dx * cone.dirX + dy * cone.dirY + dz * cone.dirZ;
  const rx = dx - cone.dirX * axial;
  const ry = dy - cone.dirY * axial;
  const rz = dz - cone.dirZ * axial;
  const radial = Math.hypot(rx, ry, rz);
  out.axial = axial;
  out.radial = radial;
  if (radial > 1e-6) {
    out.outX = rx / radial;
    out.outY = ry / radial;
    out.outZ = rz / radial;
  } else {
    out.outX = cone.forwardX;
    out.outY = cone.forwardY;
    out.outZ = cone.forwardZ;
  }
  out.forward = rx * cone.forwardX + ry * cone.forwardY + rz * cone.forwardZ;
  return out;
}

/** Same axis ramp the Flight Volume uses: zero deep inside, quadratic across
 * the margin, linear past the boundary so no overshoot can escape. */
function axisRamp(value: number, min: number, max: number, margin: number) {
  const below = min + margin - value;
  if (below > 0) {
    const ramp = Math.min(1, below / margin);
    return ramp * ramp + Math.max(0, min - value) * 4;
  }
  const above = value - (max - margin);
  if (above > 0) {
    const ramp = Math.min(1, above / margin);
    return -(ramp * ramp) - Math.max(0, value - max) * 4;
  }
  return 0;
}

const LOCAL = createLampConeLocal();

/** The radius past which the containment ramp begins to act. */
export function lampConeOuterRadius(cone: InsectLampCone, axial: number) {
  return lampConeRadius(cone, axial) * (1 + cone.overshoot);
}

export function insectLampConeContainment(
  cone: InsectLampCone,
  point: CollisionPoint,
  out: ContainmentVector,
) {
  lampConeLocal(cone, point, LOCAL);
  const outer = lampConeOuterRadius(cone, LOCAL.axial);
  // Radial containment is one-sided: there is no inner wall, because the axis
  // is where the lamp's own geometry is and repulsion owns that (ADR 0007 —
  // moths gain geometry repulsion they have never had).
  const radialRamp = axisRamp(LOCAL.radial, -outer, outer, cone.margin);
  const axialRamp = axisRamp(
    LOCAL.axial,
    cone.nearDistance,
    cone.farDistance,
    cone.margin,
  );
  out.x = LOCAL.outX * radialRamp + cone.dirX * axialRamp;
  out.y = LOCAL.outY * radialRamp + cone.dirY * axialRamp;
  out.z = LOCAL.outZ * radialRamp + cone.dirZ * axialRamp;
  return Math.min(1, Math.hypot(out.x, out.y, out.z));
}

export function insectLampConeResidencyDrift(
  cone: InsectLampCone,
  point: CollisionPoint,
  out: ContainmentVector,
) {
  lampConeLocal(cone, point, LOCAL);
  out.x = cone.forwardX;
  out.y = cone.forwardY;
  out.z = cone.forwardZ;
  if (LOCAL.forward >= 0) return 0;
  const outer = lampConeOuterRadius(cone, LOCAL.axial);
  return cone.forwardDrift * Math.min(1, -LOCAL.forward / outer);
}

/**
 * Last-resort projection back inside the cone plus `slack`.
 *
 * Deliberately far out: it acts on the OVERSHOOT boundary, not the beam, so a
 * moth drifting into the dark is never snapped. Nothing but a pathological
 * force stack should ever reach it.
 */
export function clampToInsectLampCone(
  cone: InsectLampCone,
  position: ContainmentVector,
  velocity: ContainmentVector,
  slack: number,
) {
  lampConeLocal(cone, position, LOCAL);
  const axial = Math.min(
    cone.farDistance + slack,
    Math.max(cone.nearDistance - slack, LOCAL.axial),
  );
  const outer = lampConeOuterRadius(cone, axial) + slack;
  const radial = Math.min(outer, LOCAL.radial);
  if (axial === LOCAL.axial && radial === LOCAL.radial) return false;
  position.x = cone.sourceX + cone.dirX * axial + LOCAL.outX * radial;
  position.y = cone.sourceY + cone.dirY * axial + LOCAL.outY * radial;
  position.z = cone.sourceZ + cone.dirZ * axial + LOCAL.outZ * radial;
  // Remove only the outward component on whichever bound actually clamped;
  // taking the whole velocity is what makes a boundary sticky.
  if (radial !== LOCAL.radial) {
    const outward =
      velocity.x * LOCAL.outX +
      velocity.y * LOCAL.outY +
      velocity.z * LOCAL.outZ;
    if (outward > 0) {
      velocity.x -= LOCAL.outX * outward;
      velocity.y -= LOCAL.outY * outward;
      velocity.z -= LOCAL.outZ * outward;
    }
  }
  if (axial !== LOCAL.axial) {
    const along =
      velocity.x * cone.dirX + velocity.y * cone.dirY + velocity.z * cone.dirZ;
    const escaping = LOCAL.axial > axial ? along > 0 : along < 0;
    if (escaping) {
      velocity.x -= cone.dirX * along;
      velocity.y -= cone.dirY * along;
      velocity.z -= cone.dirZ * along;
    }
  }
  return true;
}

/**
 * The Lamp Cone as an `InsectContainment`, closing over a MUTABLE cone.
 *
 * Unlike a Unit's Flight Volume, a lamp moves: it can be picked up, and its
 * registered cone is rewritten from the live fixture every frame. Holding the
 * object rather than a snapshot is what keeps a moth's containment attached to
 * the light instead of to where the light used to be.
 */
export function createInsectLampConeContainment(
  cone: InsectLampCone,
): InsectContainment {
  return {
    containment: (point, out) => insectLampConeContainment(cone, point, out),
    residencyDrift: (point, out) =>
      insectLampConeResidencyDrift(cone, point, out),
    clamp: (position, velocity, slack) =>
      clampToInsectLampCone(cone, position, velocity, slack),
  };
}
