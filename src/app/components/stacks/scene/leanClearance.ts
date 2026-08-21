import { HOVER_MOTION_SCALE, type Hinge } from "./interaction";

/**
 * WHAT A PROP DOES WHEN IT WANTS TO LEAN AND SOMETHING IS SITTING ON IT.
 *
 * ADR 0020 gave every prop in the world an automatic lean about the edge it
 * rests on, and justified the amplitude with a claim that turns out to be half
 * true: a hinged rotation cannot clip, because `hingeShift` pins the contact
 * edge. It cannot clip DOWNWARD. Nothing was watching the other end of the
 * arc, and the props that stack are exactly the ones with no room there.
 *
 * A horizontal book stack is the case that found it. `BookRowMesh` places each
 * volume "one exact half-height above the plank; each height step then leaves
 * adjacent boards touching" — a gap of zero — and `FLAT_LIFT` right beside it
 * already carried the finding in a comment: "a volume inside a horizontal
 * stack cannot rise without entering the one above it, so this one family
 * retains a small forward pull." The rise was banned in 2 units of translation
 * and then reintroduced as 12.9 degrees of rotation, which on a 0.24-deep
 * board lifts the rear corner 0.052 — a whole book height, straight through
 * its neighbour. The pen resting on the Musings paper stack is the same shape
 * of bug with a 0.559-deep prop, where the same angle sweeps 0.165.
 *
 * THE RULE. A lean may not raise the prop's rising corner into the thing above
 * it. Where there is partial room, the lean shrinks to fit. Where the fitted
 * lean would be too small to see, the prop does not simply go quiet — it
 * spends the same travel sliding TOWARD the viewer instead, which is both the
 * gesture a person actually makes with a stacked book and the one direction a
 * prop on a shelf always has air in.
 *
 * That substitution is not invented here. It is what `FLAT_LIFT` chose in
 * translation, and what the About reading stack chose bespoke when its fanned
 * trio "swing[s] through its neighbors" — `tiltOnHover={false}` plus a hand
 * authored lane per book. This is those two answers, derived.
 */

/**
 * Air left between a leaning prop and whatever rests on it.
 *
 * Small on purpose. It exists so a stack authored as exactly touching reads as
 * blocked rather than as having a hair of room, and so float error in a
 * measured neighbour box cannot open a gap that is not there. It is NOT a
 * visual margin: a prop with real room to lean should use nearly all of it.
 */
export const LEAN_CLEARANCE_MARGIN = 0.004;

/**
 * The angle below which leaning is not worth doing, in radians. ~2.3 degrees.
 *
 * Measured against the failure this whole workstream started from. The old
 * `cameraFacingHoverTilt` handed top-shelf props 2.1 degrees and the owner
 * read the entire scene as unresponsive, so anything at or under that is known
 * to be invisible from this camera rather than merely small. A prop given less
 * than this has effectively been silenced, and silence is the thing ADR 0020
 * exists to stop, so it changes channel instead.
 */
export const LEGIBLE_LEAN = 0.04;

/**
 * The largest slide that may stand in for a lean.
 *
 * Stated against `HOVER_MOTION_SCALE` like every other amplitude in the scene:
 * a band that ignores the one legibility dial is a band that stops answering
 * when someone turns the world up, which this workstream has already got wrong
 * twice. The base matches `FLAT_LIFT`'s authored forward pull, the largest
 * translation any call site asks for, so the substitution can never push a
 * prop further off its plank than the scene already pushes one on purpose.
 */
export const MAX_LEAN_SLIDE = 0.028 * HOVER_MOTION_SCALE;

/**
 * Share of a prop's own depth the slide may reach.
 *
 * The absolute cap above is the safety limit; this is the proportional one,
 * and it is what keeps the gesture reading the same on props an order of
 * magnitude apart. A quarter of the depth is about what a person pulls a book
 * out by before it is "the one I mean", and on the 0.24-deep flat books it
 * lands almost exactly on the travel the blocked lean wanted anyway.
 */
export const SLIDE_DEPTH_SHARE = 0.25;

/**
 * How far the rising corner of a hinged prop travels upward at `lean`.
 *
 * Exact rather than the small-angle `depth * lean`, because at 17 degrees —
 * what the flutter band asks of the paper stack — the approximation is 3% out
 * and this number decides whether two solids overlap.
 *
 * The corner sits `swingHeight` above the pivot and `depth` behind it, so a
 * rotation of θ about the pivot puts it at
 *   rise = swingHeight * (cos θ − 1) + depth * sin θ
 * The first term is negative for a prop standing on something (its top rolls
 * slightly down as it swings back) and positive for one hanging.
 */
export function leanRise(hinge: Hinge, lean: number): number {
  const theta = Math.abs(lean);
  return (
    hinge.swingHeight * (Math.cos(theta) - 1) + hinge.depth * Math.sin(theta)
  );
}

/**
 * The largest lean whose rising corner stays within `rise`, in radians.
 *
 * Closed form rather than a search. Writing the rise as a single sinusoid,
 *   swingHeight * cos θ + depth * sin θ = R * sin(θ + φ)
 * with R = hypot(depth, swingHeight) and φ = atan2(swingHeight, depth), the
 * constraint rise(θ) = target becomes sin(θ + φ) = (target + swingHeight) / R,
 * so θ = asin(ratio) − φ. A ratio at or over 1 means the corner can never
 * reach that height however far the prop turns, which is the honest answer for
 * a prop with more headroom than it has reach.
 *
 * THE RISE IS NOT MONOTONIC, and `asin` returning only the principal branch is
 * the correct behaviour rather than a limitation. The corner climbs to a peak
 * at θ = π/2 − φ and then comes back down, so on a TALL prop — a 2.7-unit
 * monstera, where φ is nearly a right angle — two different leans clear the
 * same height and the larger one got there by passing THROUGH the ceiling.
 * The first crossing is the only answer that holds for the whole swing, and
 * the swing is what has to stay clear, not just its endpoint.
 */
export function maxLeanForRise(hinge: Hinge, rise: number): number {
  if (rise <= 0) return 0;
  const reach = Math.hypot(hinge.depth, hinge.swingHeight);
  if (reach === 0) return 0;
  const ratio = (rise + hinge.swingHeight) / reach;
  if (ratio >= 1) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    Math.asin(ratio) - Math.atan2(hinge.swingHeight, hinge.depth),
  );
}

export type LeanBudget = {
  /** The lean to actually apply, signed as `wanted` was. */
  lean: number;
  /** Travel toward the viewer that replaces a lean there was no room for.
   * Zero whenever the prop leaned at all, so the two never compound. */
  slide: number;
};

/**
 * Fit a prop's wanted lean into the room above it.
 *
 * Three outcomes, in the order they are tried: lean as asked, lean as far as
 * it fits, or trade the lean for a slide toward the viewer. Never both — a
 * prop that leans AND slides reads as two effects rather than one gesture,
 * which is the failure the single sway spring was built to avoid.
 */
export function leanBudget(hinge: Hinge, wanted: number): LeanBudget {
  if (wanted === 0 || !Number.isFinite(hinge.headroom))
    return { lean: wanted, slide: 0 };
  const magnitude = Math.abs(wanted);
  const room = hinge.headroom - LEAN_CLEARANCE_MARGIN;
  const allowed = room <= 0 ? 0 : maxLeanForRise(hinge, room);
  if (allowed >= magnitude) return { lean: wanted, slide: 0 };
  if (allowed >= LEGIBLE_LEAN)
    return { lean: Math.sign(wanted) * allowed, slide: 0 };
  // The gesture keeps its size and changes its direction: the prop moves by
  // as much as the blocked lean would have moved it, along the one axis a
  // prop on a shelf can be sure of.
  return {
    lean: 0,
    slide: Math.min(
      leanRise(hinge, magnitude),
      hinge.depth * SLIDE_DEPTH_SHARE,
      MAX_LEAN_SLIDE,
    ),
  };
}
