// What "where an insect belongs" means, as a shape rather than a box.
//
// The Intent Layer (`insectSteering.ts`) needs exactly three things from the
// region an insect occupies, and nothing else: how hard the boundary is pushing
// and which way, an optional standing lean within the region, and a last-resort
// projection back inside. Everything else in the steering agent — the wander
// sphere, the distance field, the acceleration limits — is already
// shape-agnostic.
//
// Naming those three is what lets a second shape exist. A butterfly is
// contained by its Unit's Flight Volume (`insectFlightVolume.ts`); a moth is
// contained by the Lamp Cone of the practical it belongs to
// (`insectLampCone.ts`). Neither knows about the other, and the steering agent
// knows about neither.
import type { CollisionPoint } from "./insectCollision";

export type ContainmentVector = { x: number; y: number; z: number };

export type InsectContainment = Readonly<{
  /**
   * Write the world-space inward direction for `point` into `out` and return
   * 0..1 for how hard the boundary is pushing.
   *
   * The vector is deliberately not a force — see
   * `insectFlightVolumeContainment` for the measurement that settled it. The
   * caller folds it into the intended heading, so the insect means to come
   * back rather than being shoved.
   */
  containment(point: CollisionPoint, out: ContainmentVector): number;
  /**
   * Write the region's standing lean — a world-space unit direction — into
   * `out` and return its strength as a multiple of the wander radius. Zero for
   * a shape with no preferred half.
   */
  residencyDrift(point: CollisionPoint, out: ContainmentVector): number;
  /**
   * Last-resort projection back inside the shape plus `slack`, removing only
   * the outward component of the velocity. True when it actually moved the
   * position. Containment is meant to do this job first; this only exists so a
   * pathological force stack cannot park an insect inside the furniture.
   */
  clamp(
    position: ContainmentVector,
    velocity: ContainmentVector,
    slack: number,
  ): boolean;
}>;
