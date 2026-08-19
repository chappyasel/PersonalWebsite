/**
 * Renderer-agnostic collision kernel for insect flight and landing plans.
 *
 * Callers build coarse boxes when scene geometry changes, then use the pure
 * queries below while compiling a plan. The hot queries allocate nothing.
 * Touching a box counts as blocked: a visible air gap is part of the contract.
 */

export type CollisionPoint = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type InsectCollisionBox = Readonly<{
  id: string;
  min: CollisionPoint;
  max: CollisionPoint;
}>;

export type InsectCollisionIndex = Readonly<{
  revision: number;
  boxes: readonly InsectCollisionBox[];
}>;

export type InsectSupportContactRegion = Readonly<{
  center: CollisionPoint;
  radius: number;
}>;

export type InsectEnvelope = Readonly<{
  /** Wing-root to fully extended wing tip, including an authoring margin. */
  halfSpan: number;
  /** Thorax to the furthest forewing/hindwing point. */
  halfLength: number;
  /** Resting wing movement plus body thickness. */
  halfHeight: number;
  /** Body-center lift from the resolved surface contact while resting. This is
   * the COLLISION datum: the resting envelope and every terminal check are
   * measured from it. */
  contactLift: number;
  /**
   * Where the renderer draws the body centre while perched, above the same
   * contact.
   *
   * Deliberately separate from `contactLift`, which used to do both jobs — so
   * tuning the visible gap moved the resting envelope, and six millimetres
   * turned two good Perches red. The visual gap is a dial now; the geometry it
   * was entangled with is not.
   */
  renderLift: number;
  /** Rotation-independent radius used by flight-corridor sweeps. */
  sweepRadius: number;
  /** Settled butterflies close their wings above the thorax. Flight and every
   * moving Landing Plan phase still use `sweepRadius`; these dimensions apply
   * only after the insect has reached its final contact pose. */
  resting: Readonly<{
    /** Complete folded pose along the body heading. */
    halfLength: number;
    /** Folded-wing thickness across the body, including the slow rest flap. */
    halfSpan: number;
    /** Folded-pose box center measured outward from the surface contact. */
    centerLift: number;
    /** Folded-pose half-height along the surface normal. */
    halfHeight: number;
  }>;
}>;

/**
 * Conservative envelopes for the procedural meshes at their largest visible
 * scale. `sweepRadius` encloses the complete extended pose under any rotation;
 * terminal checks retain the flatter species-specific resting footprint.
 */
/**
 * How much larger the LANDING PLANNER's envelope is than the one the pilot is
 * actually swept against (ADR 0005).
 *
 * Sized at the tracking error it exists to absorb, which is a centimetre or
 * two near tight geometry. It is bought at a real cost: marginal Perches get
 * harder to plan for, not easier — the About collective mark sits in a 6 cm
 * gap between the desk lamp and the TJ medallion — so this is the number to
 * move first if the Perch audit starts rejecting sites that used to resolve.
 */
export const INSECT_PLAN_DILATION = 0.008;

export const INSECT_ENVELOPES = {
  butterfly: {
    halfSpan: 0.06,
    halfLength: 0.05,
    halfHeight: 0.012,
    // How far off the surface a perched body sits. There are no legs in the
    // geometry, so this IS the stance, and 22 mm under an 83 mm insect read as
    // hovering a body-width above whatever it had just landed on — most
    // obviously on small props like the TJ medallion, where the gap is a third
    // of the object. Six millimetres plus the body mesh's own 4 mm offset puts
    // it about a centimetre up: enough to clear z-fighting with the surface
    // and to read as standing on legs, not enough to read as flight.
    contactLift: 0.012,
    // Plus the body mesh's own 4 mm offset: about a centimetre of visible
    // stance, which is enough to clear z-fighting and to read as standing on
    // legs, and not enough to read as flight.
    renderLift: 0.006,
    sweepRadius: 0.08,
    resting: {
      halfLength: 0.05,
      halfSpan: 0.014,
      // Centre of the folded pose above the contact, tracking `contactLift`
      // plus the folded half-height so the kernel still describes the pose the
      // renderer actually draws.
      centerLift: 0.046,
      halfHeight: 0.034,
    },
  },
  moth: {
    halfSpan: 0.075,
    halfLength: 0.055,
    halfHeight: 0.014,
    contactLift: 0.01,
    renderLift: 0.005,
    sweepRadius: 0.095,
    resting: {
      halfLength: 0.055,
      halfSpan: 0.016,
      centerLift: 0.05,
      halfHeight: 0.044,
    },
  },
} as const satisfies Record<"butterfly" | "moth", InsectEnvelope>;

/**
 * The same envelope, grown by the plan dilation (ADR 0005).
 *
 * It grows sideways and UPWARD only. Growing it downward would push the folded
 * pose into the very surface the insect is landing on, which is the one
 * collider the plan is already forgiving — dilating into it would be asking a
 * different question, not a stricter version of the same one.
 */
function dilateInsectEnvelope(
  envelope: InsectEnvelope,
  amount: number,
): InsectEnvelope {
  return {
    ...envelope,
    halfSpan: envelope.halfSpan + amount,
    halfLength: envelope.halfLength + amount,
    halfHeight: envelope.halfHeight + amount,
    sweepRadius: envelope.sweepRadius + amount,
    resting: {
      halfLength: envelope.resting.halfLength + amount,
      halfSpan: envelope.resting.halfSpan + amount,
      centerLift: envelope.resting.centerLift + amount,
      halfHeight: envelope.resting.halfHeight + amount,
    },
  };
}

export const INSECT_PLAN_ENVELOPES: Record<
  "butterfly" | "moth",
  InsectEnvelope
> = {
  butterfly: dilateInsectEnvelope(
    INSECT_ENVELOPES.butterfly,
    INSECT_PLAN_DILATION,
  ),
  moth: dilateInsectEnvelope(INSECT_ENVELOPES.moth, INSECT_PLAN_DILATION),
};

/**
 * The collision boxes a landing insect is allowed to touch: the geometry of
 * the Perch's own prop.
 *
 * A single box id is not enough, and assuming it was is what put a red marker
 * on three good Perches. Collision boxes are one axis-aligned bound per MESH,
 * while a prop is many meshes: the contact triangle resolves onto a book's
 * pages, and then the same book's cover — a different mesh, a different id —
 * reports the resting pose as blocked. A lamp shade is worse, because its AABB
 * is a solid block enclosing the cone, so anything resting on its outside is
 * inside its own bound by construction.
 *
 * So the group is every box belonging to the same owner, plus any UNOWNED box
 * that already contains the contact point — the second clause is what catches
 * decorative meshes (a shade, a glow shell) that sit outside their prop's
 * registered interaction root and therefore inherit no owner prefix. Every
 * other prop stays hard, and the caller's contact region still bounds how far
 * from the contact this licence reaches, so it is a local exemption rather
 * than a blanket pass over a large model.
 */
export function insectSupportGroup(
  index: InsectCollisionIndex,
  supportBoxId: string | null,
  contact: CollisionPoint | null,
): ReadonlySet<string> | null {
  if (!supportBoxId) return null;
  const group = new Set<string>([supportBoxId]);
  const ownerPrefix = supportBoxId.startsWith("owner:")
    ? `${supportBoxId.slice(0, supportBoxId.indexOf(":mesh:"))}:mesh:`
    : null;
  for (const box of index.boxes) {
    if (group.has(box.id)) continue;
    if (ownerPrefix && box.id.startsWith(ownerPrefix)) {
      group.add(box.id);
      continue;
    }
    if (
      contact &&
      !box.id.startsWith("owner:") &&
      contact.x >= box.min.x &&
      contact.x <= box.max.x &&
      contact.y >= box.min.y &&
      contact.y <= box.max.y &&
      contact.z >= box.min.z &&
      contact.z <= box.max.z
    )
      group.add(box.id);
  }
  return group;
}

function samePoint(a: CollisionPoint, b: CollisionPoint) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Publish a replacement collision snapshot. Timed cache refreshes are allowed
 * to rebuild the box array, but a revision describes geometry rather than a
 * poll: it advances only when an id or bound actually changes. */
export function reviseInsectCollisionIndex(
  previous: InsectCollisionIndex | null,
  boxes: readonly InsectCollisionBox[],
): InsectCollisionIndex {
  const unchanged =
    previous?.boxes.length === boxes.length &&
    boxes.every((box, index) => {
      const before = previous.boxes[index];
      return (
        before?.id === box.id &&
        samePoint(before.min, box.min) &&
        samePoint(before.max, box.max)
      );
    });
  if (previous && unchanged) return previous;
  return { revision: (previous?.revision ?? 0) + 1, boxes };
}

export function insectCollisionRevisionIsCurrent(
  index: InsectCollisionIndex,
  plannedRevision: number,
): boolean {
  return index.revision === plannedRevision;
}

/**
 * Continuous segment-versus-AABB test after expanding the box by the sphere
 * radius (a Minkowski sum). This catches thin obstacles between rendered
 * frames and is independent of frame rate.
 *
 * Interface invariants: radius is finite and non-negative; box axes are
 * ordered (`min <= max`). Invalid values fail closed and report a collision.
 */
export function sweptSphereIntersectsBox(
  start: CollisionPoint,
  end: CollisionPoint,
  radius: number,
  box: InsectCollisionBox,
): boolean {
  return sweptSphereIntersectsBoxCoordinates(
    start.x,
    start.y,
    start.z,
    end.x,
    end.y,
    end.z,
    radius,
    box,
  );
}

function sweptSphereIntersectsBoxCoordinates(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  radius: number,
  box: InsectCollisionBox,
): boolean {
  if (
    !Number.isFinite(radius) ||
    radius < 0 ||
    !Number.isFinite(startX) ||
    !Number.isFinite(startY) ||
    !Number.isFinite(startZ) ||
    !Number.isFinite(endX) ||
    !Number.isFinite(endY) ||
    !Number.isFinite(endZ)
  ) {
    return true;
  }

  const minX = box.min.x - radius;
  const minY = box.min.y - radius;
  const minZ = box.min.z - radius;
  const maxX = box.max.x + radius;
  const maxY = box.max.y + radius;
  const maxZ = box.max.z + radius;
  if (
    minX > maxX ||
    minY > maxY ||
    minZ > maxZ ||
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    !Number.isFinite(maxZ)
  ) {
    return true;
  }

  const dx = endX - startX;
  const dy = endY - startY;
  const dz = endZ - startZ;
  let enter = 0;
  let exit = 1;

  if (Math.abs(dx) < Number.EPSILON) {
    if (startX < minX || startX > maxX) return false;
  } else {
    let near = (minX - startX) / dx;
    let far = (maxX - startX) / dx;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return false;
  }

  if (Math.abs(dy) < Number.EPSILON) {
    if (startY < minY || startY > maxY) return false;
  } else {
    let near = (minY - startY) / dy;
    let far = (maxY - startY) / dy;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return false;
  }

  if (Math.abs(dz) < Number.EPSILON) {
    if (startZ < minZ || startZ > maxZ) return false;
  } else {
    let near = (minZ - startZ) / dz;
    let far = (maxZ - startZ) / dz;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return false;
  }

  return true;
}

/** Validate every segment in an approach, settle, or departure corridor. */
export function insectCorridorIsClear(
  points: readonly CollisionPoint[],
  radius: number,
  index: InsectCollisionIndex,
  ignoredBoxes: ReadonlySet<string> | null = null,
  allowPenetrationEscape = false,
  supportContactRegion: InsectSupportContactRegion | null = null,
  /** Receives the id of the box that refused the corridor. Same reason as
   * `insectTerminalPoseIsClear`: "blocked" without "by what" costs a round of
   * guessing per site. */
  outBlockedBy: { id: string | null } | null = null,
): boolean {
  if (outBlockedBy) outBlockedBy.id = null;
  if (points.length === 0) return false;
  const segmentCount = Math.max(1, points.length - 1);
  for (let segment = 0; segment < segmentCount; segment++) {
    const start = points[segment] ?? points[0]!;
    const end = points[segment + 1] ?? start;
    const sweepMinX = Math.min(start.x, end.x) - radius;
    const sweepMinY = Math.min(start.y, end.y) - radius;
    const sweepMinZ = Math.min(start.z, end.z) - radius;
    const sweepMaxX = Math.max(start.x, end.x) + radius;
    const sweepMaxY = Math.max(start.y, end.y) + radius;
    const sweepMaxZ = Math.max(start.z, end.z) + radius;
    let boxIndex = 0;
    while (boxIndex < index.boxes.length) {
      const box = index.boxes[boxIndex]!;
      boxIndex++;
      if (ignoredBoxes?.has(box.id)) {
        if (!supportContactRegion) continue;
        if (
          !sweptSphereIntersectsBoxOutsideRegion(
            start,
            end,
            radius,
            box,
            supportContactRegion,
          )
        )
          continue;
        if (outBlockedBy) outBlockedBy.id = box.id;
        return false;
      }
      if (
        box.max.x < sweepMinX ||
        box.min.x > sweepMaxX ||
        box.max.y < sweepMinY ||
        box.min.y > sweepMaxY ||
        box.max.z < sweepMinZ ||
        box.min.z > sweepMaxZ
      )
        continue;
      if (!sweptSphereIntersectsBox(start, end, radius, box)) continue;
      if (allowPenetrationEscape) {
        const startDepth = expandedBoxPenetrationDepth(start, radius, box);
        if (startDepth >= 0) {
          if (
            penetratingLocalExitIsSafe(
              start,
              end,
              radius,
              index,
              ignoredBoxes,
              box,
            )
          )
            continue;
        }
      }
      if (outBlockedBy) outBlockedBy.id = box.id;
      return false;
    }
  }
  return true;
}

function sweptSphereIntersectsBoxOutsideRegion(
  start: CollisionPoint,
  end: CollisionPoint,
  radius: number,
  box: InsectCollisionBox,
  region: InsectSupportContactRegion,
) {
  const r = region.radius;
  if (!Number.isFinite(r) || r <= 0) return true;
  const innerMinX = region.center.x - r;
  const innerMaxX = region.center.x + r;
  const innerMinY = region.center.y - r;
  const innerMaxY = region.center.y + r;
  const innerMinZ = region.center.z - r;
  const innerMaxZ = region.center.z + r;
  const intersects = (
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ) =>
    minX <= maxX &&
    minY <= maxY &&
    minZ <= maxZ &&
    sweptSphereIntersectsBoxCoordinates(
      start.x,
      start.y,
      start.z,
      end.x,
      end.y,
      end.z,
      radius,
      {
        id: box.id,
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
      },
    );
  // Six non-overlapping slabs cover the support AABB outside the bounded
  // contact cube. Only the small central region can be treated as intentional
  // support; another part of the same mesh remains a collider.
  return (
    intersects(
      box.min.x,
      box.min.y,
      box.min.z,
      Math.min(box.max.x, innerMinX),
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMaxX),
      box.min.y,
      box.min.z,
      box.max.x,
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      box.min.y,
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMinY),
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMaxY),
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMinY),
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMaxY),
      Math.min(box.max.z, innerMinZ),
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMinY),
      Math.max(box.min.z, innerMaxZ),
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMaxY),
      box.max.z,
    )
  );
}

/**
 * Dynamic geometry can appear around an insect between collision snapshots.
 * Track the shallowest penetration among every box containing the starting
 * sphere, independent of mesh/interaction ownership. Recovery may use any
 * face within 1.25 wing radii of that nearest exit, provided at least 25% of
 * the step points toward a qualifying face ON EACH penetrated box. The
 * per-box requirement matters when bounds overlap: escaping a nearby prop
 * must not forgive a step that buries the insect farther into a shelf. The
 * local allowance avoids a permanent wedge when a different prop blocks the
 * single nearest face without permitting a traverse through the far side of
 * a large solid. Entry into any box that did not already contain the insect
 * remains forbidden.
 */
function penetratingLocalExitIsSafe(
  start: CollisionPoint,
  end: CollisionPoint,
  radius: number,
  index: InsectCollisionIndex,
  ignoredBoxes: ReadonlySet<string> | null,
  intersectedBox: InsectCollisionBox,
) {
  const epsilon = 1e-9;
  let startPotential = Number.POSITIVE_INFINITY;
  for (const candidate of index.boxes) {
    if (ignoredBoxes?.has(candidate.id)) continue;
    const depth = expandedBoxPenetrationDepth(start, radius, candidate);
    if (depth >= 0) startPotential = Math.min(startPotential, depth);
  }
  if (!Number.isFinite(startPotential)) return false;

  const maximumLocalFaceDepth = startPotential + radius * 1.25;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const minimumProgress = Math.hypot(dx, dy, dz) * 0.25;
  if (minimumProgress <= epsilon) return false;
  const minXDepth = start.x - (intersectedBox.min.x - radius);
  const maxXDepth = intersectedBox.max.x + radius - start.x;
  const minYDepth = start.y - (intersectedBox.min.y - radius);
  const maxYDepth = intersectedBox.max.y + radius - start.y;
  const minZDepth = start.z - (intersectedBox.min.z - radius);
  const maxZDepth = intersectedBox.max.z + radius - start.z;
  const progressesOutOfIntersectedBox =
    (minXDepth <= maximumLocalFaceDepth + epsilon && dx <= -minimumProgress) ||
    (maxXDepth <= maximumLocalFaceDepth + epsilon && dx >= minimumProgress) ||
    (minYDepth <= maximumLocalFaceDepth + epsilon && dy <= -minimumProgress) ||
    (maxYDepth <= maximumLocalFaceDepth + epsilon && dy >= minimumProgress) ||
    (minZDepth <= maximumLocalFaceDepth + epsilon && dz <= -minimumProgress) ||
    (maxZDepth <= maximumLocalFaceDepth + epsilon && dz >= minimumProgress);
  if (!progressesOutOfIntersectedBox) return false;

  for (const candidate of index.boxes) {
    if (ignoredBoxes?.has(candidate.id)) continue;
    if (expandedBoxPenetrationDepth(start, radius, candidate) >= 0) continue;
    if (sweptSphereIntersectsBox(start, end, radius, candidate)) return false;
  }
  return true;
}

function expandedBoxPenetrationDepth(
  point: CollisionPoint,
  radius: number,
  box: InsectCollisionBox,
) {
  return expandedBoundsPenetrationDepth(
    point,
    radius,
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z,
  );
}

function expandedBoundsPenetrationDepth(
  point: CollisionPoint,
  radius: number,
  boxMinX: number,
  boxMinY: number,
  boxMinZ: number,
  boxMaxX: number,
  boxMaxY: number,
  boxMaxZ: number,
) {
  const minX = boxMinX - radius;
  const minY = boxMinY - radius;
  const minZ = boxMinZ - radius;
  const maxX = boxMaxX + radius;
  const maxY = boxMaxY + radius;
  const maxZ = boxMaxZ + radius;
  if (
    point.x < minX ||
    point.x > maxX ||
    point.y < minY ||
    point.y > maxY ||
    point.z < minZ ||
    point.z > maxZ
  )
    return -1;
  return Math.min(
    point.x - minX,
    maxX - point.x,
    point.y - minY,
    maxY - point.y,
    point.z - minZ,
    maxZ - point.z,
  );
}

function orientedBoxIsSeparatedOnAxis(
  axisX: number,
  axisY: number,
  axisZ: number,
  deltaX: number,
  deltaY: number,
  deltaZ: number,
  tangentX: number,
  tangentY: number,
  tangentZ: number,
  bitangentX: number,
  bitangentY: number,
  bitangentZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  tangentExtent: number,
  bitangentExtent: number,
  normalExtent: number,
  boxExtentX: number,
  boxExtentY: number,
  boxExtentZ: number,
) {
  if (axisX * axisX + axisY * axisY + axisZ * axisZ < 1e-16) return false;
  const centerDistance = Math.abs(
    deltaX * axisX + deltaY * axisY + deltaZ * axisZ,
  );
  const restingRadius =
    tangentExtent *
      Math.abs(tangentX * axisX + tangentY * axisY + tangentZ * axisZ) +
    bitangentExtent *
      Math.abs(bitangentX * axisX + bitangentY * axisY + bitangentZ * axisZ) +
    normalExtent *
      Math.abs(normalX * axisX + normalY * axisY + normalZ * axisZ);
  const boxRadius =
    boxExtentX * Math.abs(axisX) +
    boxExtentY * Math.abs(axisY) +
    boxExtentZ * Math.abs(axisZ);
  return centerDistance > restingRadius + boxRadius;
}

/** Exact SAT overlap between the folded resting OBB and one world AABB. */
function foldedPoseIntersectsBoxCoordinates(
  centerX: number,
  centerY: number,
  centerZ: number,
  tangentX: number,
  tangentY: number,
  tangentZ: number,
  bitangentX: number,
  bitangentY: number,
  bitangentZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  tangentExtent: number,
  bitangentExtent: number,
  normalExtent: number,
  boxMinX: number,
  boxMinY: number,
  boxMinZ: number,
  boxMaxX: number,
  boxMaxY: number,
  boxMaxZ: number,
) {
  if (boxMinX > boxMaxX || boxMinY > boxMaxY || boxMinZ > boxMaxZ) return false;
  const boxCenterX = (boxMinX + boxMaxX) * 0.5;
  const boxCenterY = (boxMinY + boxMaxY) * 0.5;
  const boxCenterZ = (boxMinZ + boxMaxZ) * 0.5;
  const boxExtentX = (boxMaxX - boxMinX) * 0.5;
  const boxExtentY = (boxMaxY - boxMinY) * 0.5;
  const boxExtentZ = (boxMaxZ - boxMinZ) * 0.5;
  const deltaX = boxCenterX - centerX;
  const deltaY = boxCenterY - centerY;
  const deltaZ = boxCenterZ - centerZ;
  const separated = (axisX: number, axisY: number, axisZ: number) =>
    orientedBoxIsSeparatedOnAxis(
      axisX,
      axisY,
      axisZ,
      deltaX,
      deltaY,
      deltaZ,
      tangentX,
      tangentY,
      tangentZ,
      bitangentX,
      bitangentY,
      bitangentZ,
      normalX,
      normalY,
      normalZ,
      tangentExtent,
      bitangentExtent,
      normalExtent,
      boxExtentX,
      boxExtentY,
      boxExtentZ,
    );
  // The three world axes, the three resting-pose axes, and their nine cross
  // products are the complete separating-axis set for OBB-versus-AABB.
  return !(
    separated(1, 0, 0) ||
    separated(0, 1, 0) ||
    separated(0, 0, 1) ||
    separated(tangentX, tangentY, tangentZ) ||
    separated(bitangentX, bitangentY, bitangentZ) ||
    separated(normalX, normalY, normalZ) ||
    separated(0, -tangentZ, tangentY) ||
    separated(tangentZ, 0, -tangentX) ||
    separated(-tangentY, tangentX, 0) ||
    separated(0, -bitangentZ, bitangentY) ||
    separated(bitangentZ, 0, -bitangentX) ||
    separated(-bitangentY, bitangentX, 0) ||
    separated(0, -normalZ, normalY) ||
    separated(normalZ, 0, -normalX) ||
    separated(-normalY, normalX, 0)
  );
}

/** Continuous translation of a fixed-orientation folded OBB against an AABB.
 * Each separating axis contributes the time interval in which its projected
 * spans overlap; collision exists only when all 15 intervals share a time. */
function sweptFoldedPoseIntersectsBoxCoordinates(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  tangentX: number,
  tangentY: number,
  tangentZ: number,
  bitangentX: number,
  bitangentY: number,
  bitangentZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  tangentExtent: number,
  bitangentExtent: number,
  normalExtent: number,
  boxMinX: number,
  boxMinY: number,
  boxMinZ: number,
  boxMaxX: number,
  boxMaxY: number,
  boxMaxZ: number,
) {
  if (boxMinX > boxMaxX || boxMinY > boxMaxY || boxMinZ > boxMaxZ) return false;
  const boxCenterX = (boxMinX + boxMaxX) * 0.5;
  const boxCenterY = (boxMinY + boxMaxY) * 0.5;
  const boxCenterZ = (boxMinZ + boxMaxZ) * 0.5;
  const boxExtentX = (boxMaxX - boxMinX) * 0.5;
  const boxExtentY = (boxMaxY - boxMinY) * 0.5;
  const boxExtentZ = (boxMaxZ - boxMinZ) * 0.5;
  const startDeltaX = boxCenterX - startX;
  const startDeltaY = boxCenterY - startY;
  const startDeltaZ = boxCenterZ - startZ;
  const velocityX = startX - endX;
  const velocityY = startY - endY;
  const velocityZ = startZ - endZ;
  let enter = 0;
  let exit = 1;
  const includeAxis = (axisX: number, axisY: number, axisZ: number) => {
    if (axisX * axisX + axisY * axisY + axisZ * axisZ < 1e-16) return true;
    const radius =
      tangentExtent *
        Math.abs(tangentX * axisX + tangentY * axisY + tangentZ * axisZ) +
      bitangentExtent *
        Math.abs(bitangentX * axisX + bitangentY * axisY + bitangentZ * axisZ) +
      normalExtent *
        Math.abs(normalX * axisX + normalY * axisY + normalZ * axisZ) +
      boxExtentX * Math.abs(axisX) +
      boxExtentY * Math.abs(axisY) +
      boxExtentZ * Math.abs(axisZ);
    const startDistance =
      startDeltaX * axisX + startDeltaY * axisY + startDeltaZ * axisZ;
    const projectedVelocity =
      velocityX * axisX + velocityY * axisY + velocityZ * axisZ;
    if (Math.abs(projectedVelocity) < Number.EPSILON)
      return Math.abs(startDistance) <= radius;
    let near = (-radius - startDistance) / projectedVelocity;
    let far = (radius - startDistance) / projectedVelocity;
    if (near > far) {
      const swap = near;
      near = far;
      far = swap;
    }
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    return enter <= exit;
  };
  return (
    includeAxis(1, 0, 0) &&
    includeAxis(0, 1, 0) &&
    includeAxis(0, 0, 1) &&
    includeAxis(tangentX, tangentY, tangentZ) &&
    includeAxis(bitangentX, bitangentY, bitangentZ) &&
    includeAxis(normalX, normalY, normalZ) &&
    includeAxis(0, -tangentZ, tangentY) &&
    includeAxis(tangentZ, 0, -tangentX) &&
    includeAxis(-tangentY, tangentX, 0) &&
    includeAxis(0, -bitangentZ, bitangentY) &&
    includeAxis(bitangentZ, 0, -bitangentX) &&
    includeAxis(-bitangentY, bitangentX, 0) &&
    includeAxis(0, -normalZ, normalY) &&
    includeAxis(normalZ, 0, -normalX) &&
    includeAxis(-normalY, normalX, 0)
  );
}

function sweptFoldedPoseIntersectsBoxOutsideRegion(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  tangentX: number,
  tangentY: number,
  tangentZ: number,
  bitangentX: number,
  bitangentY: number,
  bitangentZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  tangentExtent: number,
  bitangentExtent: number,
  normalExtent: number,
  box: InsectCollisionBox,
  region: InsectSupportContactRegion,
) {
  const radius = region.radius;
  if (!Number.isFinite(radius) || radius <= 0) return true;
  const innerMinX = region.center.x - radius;
  const innerMaxX = region.center.x + radius;
  const innerMinY = region.center.y - radius;
  const innerMaxY = region.center.y + radius;
  const innerMinZ = region.center.z - radius;
  const innerMaxZ = region.center.z + radius;
  const intersects = (
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ) =>
    sweptFoldedPoseIntersectsBoxCoordinates(
      startX,
      startY,
      startZ,
      endX,
      endY,
      endZ,
      tangentX,
      tangentY,
      tangentZ,
      bitangentX,
      bitangentY,
      bitangentZ,
      normalX,
      normalY,
      normalZ,
      tangentExtent,
      bitangentExtent,
      normalExtent,
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
    );
  return (
    intersects(
      box.min.x,
      box.min.y,
      box.min.z,
      Math.min(box.max.x, innerMinX),
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMaxX),
      box.min.y,
      box.min.z,
      box.max.x,
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      box.min.y,
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMinY),
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMaxY),
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMinY),
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMaxY),
      Math.min(box.max.z, innerMinZ),
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMinY),
      Math.max(box.min.z, innerMaxZ),
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMaxY),
      box.max.z,
    )
  );
}

/** Sweep the folded, surface-aligned terminal envelope. This is used for
 * touchdown/rest and the short normal-axis lift at the start of launch. The
 * remainder of approach and launch keeps the full flying sphere. */
export function insectFoldedCorridorIsClear(
  points: readonly CollisionPoint[],
  normal: CollisionPoint,
  tangent: CollisionPoint,
  envelope: InsectEnvelope,
  index: InsectCollisionIndex,
  supportBoxes: ReadonlySet<string> | null = null,
  supportContactRegion: InsectSupportContactRegion | null = null,
  outBlockedBy: { id: string | null } | null = null,
) {
  if (outBlockedBy) outBlockedBy.id = null;
  if (points.length === 0) return false;
  const normalLength = Math.hypot(normal.x, normal.y, normal.z);
  if (normalLength < 1e-8) return false;
  const nx = normal.x / normalLength;
  const ny = normal.y / normalLength;
  const nz = normal.z / normalLength;
  const tangentAlongNormal = tangent.x * nx + tangent.y * ny + tangent.z * nz;
  const rawTx = tangent.x - nx * tangentAlongNormal;
  const rawTy = tangent.y - ny * tangentAlongNormal;
  const rawTz = tangent.z - nz * tangentAlongNormal;
  const tangentLength = Math.hypot(rawTx, rawTy, rawTz);
  if (tangentLength < 1e-8) return false;
  const tx = rawTx / tangentLength;
  const ty = rawTy / tangentLength;
  const tz = rawTz / tangentLength;
  const bx = ny * tz - nz * ty;
  const by = nz * tx - nx * tz;
  const bz = nx * ty - ny * tx;
  const centerOffset = envelope.resting.centerLift - envelope.contactLift;
  const segmentCount = Math.max(1, points.length - 1);
  for (let segment = 0; segment < segmentCount; segment++) {
    const start = points[segment] ?? points[0]!;
    const end = points[segment + 1] ?? start;
    const startX = start.x + nx * centerOffset;
    const startY = start.y + ny * centerOffset;
    const startZ = start.z + nz * centerOffset;
    const endX = end.x + nx * centerOffset;
    const endY = end.y + ny * centerOffset;
    const endZ = end.z + nz * centerOffset;
    for (const candidate of index.boxes) {
      if (supportBoxes?.has(candidate.id)) {
        if (!supportContactRegion) continue;
        if (
          !sweptFoldedPoseIntersectsBoxOutsideRegion(
            startX,
            startY,
            startZ,
            endX,
            endY,
            endZ,
            tx,
            ty,
            tz,
            bx,
            by,
            bz,
            nx,
            ny,
            nz,
            envelope.resting.halfLength,
            envelope.resting.halfSpan,
            envelope.resting.halfHeight,
            candidate,
            supportContactRegion,
          )
        )
          continue;
        if (outBlockedBy) outBlockedBy.id = candidate.id;
        return false;
      }
      if (
        sweptFoldedPoseIntersectsBoxCoordinates(
          startX,
          startY,
          startZ,
          endX,
          endY,
          endZ,
          tx,
          ty,
          tz,
          bx,
          by,
          bz,
          nx,
          ny,
          nz,
          envelope.resting.halfLength,
          envelope.resting.halfSpan,
          envelope.resting.halfHeight,
          candidate.min.x,
          candidate.min.y,
          candidate.min.z,
          candidate.max.x,
          candidate.max.y,
          candidate.max.z,
        )
      ) {
        if (outBlockedBy) outBlockedBy.id = candidate.id;
        return false;
      }
    }
  }
  return true;
}

function foldedPoseIntersectsBoxOutsideRegion(
  centerX: number,
  centerY: number,
  centerZ: number,
  tangentX: number,
  tangentY: number,
  tangentZ: number,
  bitangentX: number,
  bitangentY: number,
  bitangentZ: number,
  normalX: number,
  normalY: number,
  normalZ: number,
  tangentExtent: number,
  bitangentExtent: number,
  normalExtent: number,
  box: InsectCollisionBox,
  region: InsectSupportContactRegion,
) {
  const radius = region.radius;
  if (!Number.isFinite(radius) || radius <= 0) return true;
  const innerMinX = region.center.x - radius;
  const innerMaxX = region.center.x + radius;
  const innerMinY = region.center.y - radius;
  const innerMaxY = region.center.y + radius;
  const innerMinZ = region.center.z - radius;
  const innerMaxZ = region.center.z + radius;
  const intersects = (
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ) =>
    foldedPoseIntersectsBoxCoordinates(
      centerX,
      centerY,
      centerZ,
      tangentX,
      tangentY,
      tangentZ,
      bitangentX,
      bitangentY,
      bitangentZ,
      normalX,
      normalY,
      normalZ,
      tangentExtent,
      bitangentExtent,
      normalExtent,
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
    );
  return (
    intersects(
      box.min.x,
      box.min.y,
      box.min.z,
      Math.min(box.max.x, innerMinX),
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMaxX),
      box.min.y,
      box.min.z,
      box.max.x,
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      box.min.y,
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMinY),
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMaxY),
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      box.max.y,
      box.max.z,
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMinY),
      box.min.z,
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMaxY),
      Math.min(box.max.z, innerMinZ),
    ) ||
    intersects(
      Math.max(box.min.x, innerMinX),
      Math.max(box.min.y, innerMinY),
      Math.max(box.min.z, innerMaxZ),
      Math.min(box.max.x, innerMaxX),
      Math.min(box.max.y, innerMaxY),
      box.max.z,
    )
  );
}

/**
 * Check the complete folded resting pose against surrounding boxes. Unlike a
 * flight sweep, this is an oriented box: body length stays tangent to the
 * surface while the closed wings rise along the normal. That distinction is
 * what permits natural top-edge contacts without forgiving nearby geometry.
 * The intended support is identified by the resolved triangle hit. Only its
 * bounded contact region is excepted; the rest of that mesh stays collidable.
 */
export function insectTerminalPoseIsClear(
  contact: CollisionPoint,
  normal: CollisionPoint,
  tangent: CollisionPoint,
  envelope: InsectEnvelope,
  index: InsectCollisionIndex,
  supportBoxes: ReadonlySet<string> | null,
  supportContactRegion: InsectSupportContactRegion | null = null,
  /** Receives the id of the box that rejected the pose. "Which collider" is the
   * question every `resting-pose-blocked` investigation opens with, and without
   * it the answer costs a round of guessing per site. */
  outBlockedBy: { id: string | null } | null = null,
): boolean {
  if (outBlockedBy) outBlockedBy.id = null;
  const normalLength = Math.hypot(normal.x, normal.y, normal.z);
  if (normalLength < 1e-8) return false;
  const nx = normal.x / normalLength;
  const ny = normal.y / normalLength;
  const nz = normal.z / normalLength;
  const tangentAlongNormal = tangent.x * nx + tangent.y * ny + tangent.z * nz;
  const rawTx = tangent.x - nx * tangentAlongNormal;
  const rawTy = tangent.y - ny * tangentAlongNormal;
  const rawTz = tangent.z - nz * tangentAlongNormal;
  const tangentLength = Math.hypot(rawTx, rawTy, rawTz);
  if (tangentLength < 1e-8) return false;
  const tx = rawTx / tangentLength;
  const ty = rawTy / tangentLength;
  const tz = rawTz / tangentLength;
  // `tangent` is the insect's fore/aft body heading. The rendered wing roots
  // extend along the orthogonal surface axis (normal × tangent).
  const bx = ny * tz - nz * ty;
  const by = nz * tx - nx * tz;
  const bz = nx * ty - ny * tx;
  const centerX = contact.x + nx * envelope.resting.centerLift;
  const centerY = contact.y + ny * envelope.resting.centerLift;
  const centerZ = contact.z + nz * envelope.resting.centerLift;

  let boxIndex = 0;
  while (boxIndex < index.boxes.length) {
    const box = index.boxes[boxIndex]!;
    boxIndex++;
    if (supportBoxes?.has(box.id)) {
      if (!supportContactRegion) continue;
      if (
        !foldedPoseIntersectsBoxOutsideRegion(
          centerX,
          centerY,
          centerZ,
          tx,
          ty,
          tz,
          bx,
          by,
          bz,
          nx,
          ny,
          nz,
          envelope.resting.halfLength,
          envelope.resting.halfSpan,
          envelope.resting.halfHeight,
          box,
          supportContactRegion,
        )
      )
        continue;
      if (outBlockedBy) outBlockedBy.id = box.id;
      return false;
    }
    if (
      foldedPoseIntersectsBoxCoordinates(
        centerX,
        centerY,
        centerZ,
        tx,
        ty,
        tz,
        bx,
        by,
        bz,
        nx,
        ny,
        nz,
        envelope.resting.halfLength,
        envelope.resting.halfSpan,
        envelope.resting.halfHeight,
        box.min.x,
        box.min.y,
        box.min.z,
        box.max.x,
        box.max.y,
        box.max.z,
      )
    ) {
      if (outBlockedBy) outBlockedBy.id = box.id;
      return false;
    }
  }
  return true;
}

/**
 * Exact signed distance from a point to the nearest collision box, with the
 * outward unit gradient written into `outGradient`.
 *
 * Soft-collision roaming needs a force, not a verdict, and the collision index
 * is already nothing but axis-aligned boxes — so the analytic box distance is
 * exact with no grid, no precompute, and no fast-marching. Negative values
 * mean the point is inside a box, in which case the gradient points along the
 * shallowest escape axis.
 *
 * Interface invariants: `outGradient` always receives a unit vector, even for
 * an empty index or a degenerate box, so callers never need a magnitude guard.
 */
export function insectDistanceField(
  point: CollisionPoint,
  index: InsectCollisionIndex,
  outGradient: { x: number; y: number; z: number },
): number {
  outGradient.x = 0;
  outGradient.y = 1;
  outGradient.z = 0;
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  )
    return 0;

  let nearest = Number.POSITIVE_INFINITY;
  for (const box of index.boxes) {
    const centerX = (box.min.x + box.max.x) / 2;
    const centerY = (box.min.y + box.max.y) / 2;
    const centerZ = (box.min.z + box.max.z) / 2;
    const halfX = (box.max.x - box.min.x) / 2;
    const halfY = (box.max.y - box.min.y) / 2;
    const halfZ = (box.max.z - box.min.z) / 2;
    const offsetX = point.x - centerX;
    const offsetY = point.y - centerY;
    const offsetZ = point.z - centerZ;
    const overX = Math.abs(offsetX) - halfX;
    const overY = Math.abs(offsetY) - halfY;
    const overZ = Math.abs(offsetZ) - halfZ;
    const outsideX = Math.max(overX, 0);
    const outsideY = Math.max(overY, 0);
    const outsideZ = Math.max(overZ, 0);
    const outside = Math.hypot(outsideX, outsideY, outsideZ);
    const inside = Math.min(Math.max(overX, overY, overZ), 0);
    const distance = outside + inside;
    if (distance >= nearest) continue;
    nearest = distance;
    if (outside > 1e-9) {
      outGradient.x = (offsetX < 0 ? -outsideX : outsideX) / outside;
      outGradient.y = (offsetY < 0 ? -outsideY : outsideY) / outside;
      outGradient.z = (offsetZ < 0 ? -outsideZ : outsideZ) / outside;
      continue;
    }
    // Inside, or exactly on a face. Leave along whichever axis is nearest to
    // open air; any other choice pushes deeper through the box.
    outGradient.x = 0;
    outGradient.y = 0;
    outGradient.z = 0;
    if (overX >= overY && overX >= overZ) outGradient.x = offsetX < 0 ? -1 : 1;
    else if (overY >= overZ) outGradient.y = offsetY < 0 ? -1 : 1;
    else outGradient.z = offsetZ < 0 ? -1 : 1;
  }
  return Number.isFinite(nearest) ? nearest : Number.POSITIVE_INFINITY;
}
