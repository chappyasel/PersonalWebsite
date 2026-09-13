import {
  INSECT_PLAN_DILATION,
  INSECT_PLAN_ENVELOPES,
  type InsectCollisionIndex,
  type InsectSupportContactRegion,
  insectCorridorIsClear,
  insectFoldedCorridorIsClear,
} from "./insectCollision";
import {
  type InsectLandingPlanRequest,
  compileInsectLandingPlan,
} from "./insectLanding";

export type LandingRequest = Omit<
  InsectLandingPlanRequest,
  "sweep" | "foldedSweep" | "collisionRevision"
>;
export type LandingSnapshot = {
  request: LandingRequest;
  species: "moth" | "butterfly";
  index: InsectCollisionIndex;
  ground: number;
  supportIds: string[];
  supportContactRegion: InsectSupportContactRegion;
};

/** Same numerical collision contract for synchronous and worker planning. */
export function compileLandingSnapshot({
  request,
  species,
  index,
  ground,
  supportIds,
  supportContactRegion,
}: LandingSnapshot) {
  const started = performance.now();
  const supportGroup = new Set(supportIds);
  let worstBlocker: string | null = null;
  // Which collider refused the most candidates. The compiler tries well over
  // a hundred curves and reports only that they all failed, so without a
  // tally the answer to "why can nothing land here" is a guess.
  const blockerTally = new Map<string, number>();
  const blocker: { id: string | null } = { id: null };
  const tallyBlocker = () => {
    if (!blocker.id) return;
    blockerTally.set(blocker.id, (blockerTally.get(blocker.id) ?? 0) + 1);
  };
  const compiled = compileInsectLandingPlan({
    ...request,
    volume: request.volume,
    collisionRevision: index.revision,
    foldedSweep: (_phase, from, to) => {
      const routeRadius = request.profile.wingRadius + INSECT_PLAN_DILATION;
      if (from.y - routeRadius < ground || to.y - routeRadius < ground)
        return false;
      const folded = insectFoldedCorridorIsClear(
        [from, to],
        request.target.normal,
        request.target.tangent,
        // Dilated, for the same reason the sphere is: the pilot flies the
        // hover arc and the touchdown with the folded pose, and it tracks
        // them rather than replaying them (ADR 0005).
        INSECT_PLAN_ENVELOPES[species],
        index,
        supportGroup,
        supportContactRegion,
        blocker,
      );
      if (!folded) tallyBlocker();
      return folded;
    },
    sweep: (phase, from, to) => {
      // Plan dilated, fly exact (ADR 0005). The pilot TRACKS this route with
      // finite gain and jerk limits rather than replaying it, which is what
      // keeps the motion from reading as a machine following a spline — and
      // means it deviates by a centimetre or two. Validating with a slightly
      // larger radius than the one the pilot is swept against absorbs that
      // by construction instead of making it fatal.
      const routeRadius = request.profile.wingRadius + INSECT_PLAN_DILATION;
      if (from.y - routeRadius < ground || to.y - routeRadius < ground)
        return false;
      // The Arrival Curve spirals inward rather than holding station at a
      // fixed standoff, so every phase of it ends up close enough to the
      // reserved support to graze it.
      //
      // `approach` used to be excluded on the principle that an insect should
      // reach open air before being forgiven anything. That principle quietly
      // made a whole CLASS of Perch unreachable: on a crown — the globe, the
      // microphone, the collective mark — the prop's own bounding box is
      // directly under the entire arrival, so the approach slice is inside it
      // by construction and no bearing, size or tilt can escape. Landings
      // succeeded only on flat tops, where the box lies below the contact.
      //
      // It is still local, not a blanket pass: `supportContactRegion` bounds
      // the exemption to a wing-radius-and-a-half of the contact, so the far
      // side of the same prop remains hard, and every other collider always
      // was.
      const supportPhase =
        phase === "approach" ||
        phase === "hover" ||
        phase === "touchdown" ||
        phase === "launch";
      const clear = insectCorridorIsClear(
        [from, to],
        routeRadius,
        index,
        supportPhase ? supportGroup : null,
        false,
        supportPhase ? supportContactRegion : null,
        blocker,
      );
      if (!clear) tallyBlocker();
      return clear;
    },
  });
  if (!compiled.ok && blockerTally.size > 0) {
    let worst: string | null = null;
    let worstCount = 0;
    for (const [id, count] of blockerTally)
      if (count > worstCount) {
        worst = id;
        worstCount = count;
      }
    worstBlocker = worst;
  }

  return {
    result: compiled,
    worstBlocker,
    planningMs: performance.now() - started,
  };
}

/** A worker snapshot encloses small ambient motion during message delivery.
 * This expands obstacles; it never relaxes a route's clearance. */
export function createLandingCollisionSnapshot(
  index: InsectCollisionIndex,
): InsectCollisionIndex {
  const margin = 0.002;
  return {
    revision: index.revision,
    boxes: index.boxes.map((box) => ({
      id: box.id,
      min: {
        x: box.min.x - margin,
        y: box.min.y - margin,
        z: box.min.z - margin,
      },
      max: {
        x: box.max.x + margin,
        y: box.max.y + margin,
        z: box.max.z + margin,
      },
    })),
  };
}

/** Linear containment proof, not a route search. The worker already swept
 * against these larger boxes; unchanged IDs and contained bounds certify that
 * its route also clears the current geometry. */
export function landingSnapshotContains(
  snapshot: InsectCollisionIndex,
  current: InsectCollisionIndex,
) {
  return (
    snapshot.boxes.length === current.boxes.length &&
    current.boxes.every((box, i) => {
      const outer = snapshot.boxes[i]!;
      return (
        outer.id === box.id &&
        box.min.x >= outer.min.x &&
        box.min.y >= outer.min.y &&
        box.min.z >= outer.min.z &&
        box.max.x <= outer.max.x &&
        box.max.y <= outer.max.y &&
        box.max.z <= outer.max.z
      );
    })
  );
}
