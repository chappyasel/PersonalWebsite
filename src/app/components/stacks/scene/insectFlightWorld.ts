import * as THREE from "three";

import {
  INSECT_ENVELOPES,
  INSECT_PLAN_DILATION,
  INSECT_PLAN_ENVELOPES,
  type InsectCollisionBox,
  type InsectCollisionIndex,
  type InsectSupportContactRegion,
  insectCorridorIsClear,
  insectDistanceField,
  insectFoldedCorridorIsClear,
  insectSupportGroup,
  insectTerminalPoseIsClear,
  reviseInsectCollisionIndex,
} from "./insectCollision";
import {
  type InsectFlightVolume,
  createInsectFlightVolume,
} from "./insectFlightVolume";
import {
  type InsectLandingPlanRequest,
  type InsectLandingPlanResult,
  compileInsectLandingPlan,
} from "./insectLanding";
import {
  type InsectPerchDiagnostic,
  type InsectPerchRejectionCode,
  evaluateInsectPerchDiagnostic,
  insectDiagnosticsController,
} from "./insectPerchDiagnostic";
import {
  claimInsectPerch,
  getInsectPerch,
  insectPerchOccupant,
  insectPerchOwnerId,
  lampPerchIsLit,
  readInsectPerchWorld,
  releaseInsectPerch,
  resolveInsectPerch,
} from "./insectPerches";
import type {
  InsectFlightWorld,
  InsectKinematicSample,
  InsectLandingTarget,
} from "./insectPilot";
import { sceneInteractionInventory } from "./interactionRegistry";
import { MEADOW_GROUND_BASE } from "./meadowField";
import { unitPose } from "./worldLayout";

type InsectSpecies = keyof typeof INSECT_ENVELOPES;
type CruiseSampler = (
  flightId: number,
  time: number,
  out: InsectKinematicSample,
) => void;

type CollisionCache = {
  root: THREE.Object3D;
  index: InsectCollisionIndex;
  builtAt: number;
};

const ROOTS = new Map<number, THREE.Object3D>();
const CACHES = new Map<number, CollisionCache>();
const BOX = new THREE.Box3();
const MATRIX = new THREE.Matrix4();
const POSITION = new THREE.Vector3();
const NORMAL = new THREE.Vector3();
const QUATERNION = new THREE.Quaternion();
const TARGET_POINTS: [
  { x: number; y: number; z: number },
  { x: number; y: number; z: number },
] = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
];
const INDEX_REFRESH_SECONDS = 0.2;

function isInside(object: THREE.Object3D, ancestor: THREE.Object3D) {
  for (
    let current: THREE.Object3D | null = object;
    current;
    current = current.parent
  )
    if (current === ancestor) return true;
  return false;
}

function materialWritesVisibleColor(material: THREE.Material) {
  return (
    material.visible &&
    material.colorWrite &&
    (!material.transparent || material.opacity > 0.05)
  );
}

function meshWritesVisibleColor(mesh: THREE.Mesh) {
  if (!mesh.visible || !mesh.geometry) return false;
  for (
    let current: THREE.Object3D | null = mesh;
    current;
    current = current.parent
  )
    if (!current.visible) return false;
  if (!Array.isArray(mesh.material))
    return materialWritesVisibleColor(mesh.material);
  for (const material of mesh.material)
    if (materialWritesVisibleColor(material)) return true;
  return false;
}

function collisionBoxById(
  index: InsectCollisionIndex,
  id: string | null,
): InsectCollisionBox | null {
  if (!id) return null;
  for (const box of index.boxes) if (box.id === id) return box;
  return null;
}

function rebuildCollisionIndex(unitIndex: number, now: number) {
  const root = ROOTS.get(unitIndex);
  if (!root?.parent) return null;
  root.updateWorldMatrix(true, true);
  const owners = sceneInteractionInventory().filter(
    (interaction) =>
      interaction.activeUnits.includes(unitIndex) &&
      isInside(interaction.root, root),
  );
  const boxes: InsectCollisionBox[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >;
    if (!mesh.isMesh || !meshWritesVisibleColor(mesh)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    BOX.copy(geometry.boundingBox);
    MATRIX.copy(mesh.matrixWorld);
    BOX.applyMatrix4(MATRIX);
    if (BOX.isEmpty()) return;
    const owner = owners.find((candidate) => isInside(mesh, candidate.root));
    boxes.push({
      id: owner ? `owner:${owner.id}:mesh:${mesh.uuid}` : `mesh:${mesh.uuid}`,
      min: { x: BOX.min.x, y: BOX.min.y, z: BOX.min.z },
      max: { x: BOX.max.x, y: BOX.max.y, z: BOX.max.z },
    });
  });
  const previous = CACHES.get(unitIndex);
  const cache: CollisionCache = {
    root,
    index: reviseInsectCollisionIndex(previous?.index ?? null, boxes),
    builtAt: now,
  };
  CACHES.set(unitIndex, cache);
  return cache;
}

function collisionCache(unitIndex: number, now: number, force = false) {
  const root = ROOTS.get(unitIndex);
  const current = CACHES.get(unitIndex);
  if (
    force ||
    !current ||
    current.root !== root ||
    now < current.builtAt ||
    now - current.builtAt >= INDEX_REFRESH_SECONDS
  )
    return rebuildCollisionIndex(unitIndex, now);
  return current;
}

/** The Scene registers the actual unit group rather than making collision
 * code infer hierarchy from an individual Perch anchor. */
export function registerInsectCollisionRoot(
  unitIndex: number,
  root: THREE.Object3D,
) {
  ROOTS.set(unitIndex, root);
  CACHES.delete(unitIndex);
  return () => {
    if (ROOTS.get(unitIndex) === root) ROOTS.delete(unitIndex);
    CACHES.delete(unitIndex);
  };
}

export function insectCollisionIndexRevision(
  unitIndex: number,
  now: number,
  force = false,
) {
  return collisionCache(unitIndex, now, force)?.index.revision ?? null;
}

/** Resolve a semantic Perch into the small target interface the pilot knows.
 * The final body lift comes from the species envelope; authored clearance
 * controls how far outside the surface braking begins. */
export function prepareInsectLandingTarget(
  perchId: string,
  species: InsectSpecies,
  out: InsectLandingTarget,
) {
  const perch = getInsectPerch(perchId);
  if (!perch) return false;
  // Claim/candidate acquisition resolves the triangle once. During approach
  // and rest the owner-local hit follows the prop without repeating the 25-ray
  // contact search every rendered frame.
  if (!perch.resolvedRoot && !resolveInsectPerch(perch).ok) return false;
  if (!readInsectPerchWorld(perch, POSITION, NORMAL, QUATERNION)) {
    if (!resolveInsectPerch(perch).ok) return false;
    if (!readInsectPerchWorld(perch, POSITION, NORMAL, QUATERNION))
      return false;
  }
  out.id = perch.id;
  out.point.x = POSITION.x;
  out.point.y = POSITION.y;
  out.point.z = POSITION.z;
  out.normal.x = NORMAL.x;
  out.normal.y = NORMAL.y;
  out.normal.z = NORMAL.z;

  // An authored tangent wins when a surface needs a particular resting
  // heading. Otherwise face broadly toward the camera side (+Z).
  let tx: number;
  let ty: number;
  let tz: number;
  if (perch.tangent) {
    perch.anchor.getWorldQuaternion(QUATERNION);
    POSITION.set(...perch.tangent).applyQuaternion(QUATERNION);
    const alongNormal = POSITION.dot(NORMAL);
    tx = POSITION.x - NORMAL.x * alongNormal;
    ty = POSITION.y - NORMAL.y * alongNormal;
    tz = POSITION.z - NORMAL.z * alongNormal;
  } else {
    tx = -NORMAL.x * NORMAL.z;
    ty = -NORMAL.y * NORMAL.z;
    tz = 1 - NORMAL.z * NORMAL.z;
  }
  let length = Math.hypot(tx, ty, tz);
  if (length < 1e-6) {
    tx = 1 - NORMAL.x * NORMAL.x;
    ty = -NORMAL.y * NORMAL.x;
    tz = -NORMAL.z * NORMAL.x;
    length = Math.max(1e-6, Math.hypot(tx, ty, tz));
  }
  out.tangent.x = tx / length;
  out.tangent.y = ty / length;
  out.tangent.z = tz / length;
  out.clearance = INSECT_ENVELOPES[species].contactLift;
  out.approachDistance = Math.max(
    perch.clearance,
    INSECT_ENVELOPES[species].sweepRadius,
  );
  return true;
}

const DIAGNOSTIC_AUTHORED = new THREE.Vector3();

/** Evaluate a live Perch through the same contact, envelope, occupancy, and
 * collision seam used by reservation. The development renderer only displays
 * this result; it does not maintain a second idea of validity. */
export function diagnoseInsectPerch(
  perchId: string,
  species: InsectSpecies,
  now: number,
  automaticLandingsPaused = false,
  plannedCollisionRevision: number | null = null,
): InsectPerchDiagnostic {
  const perch = getInsectPerch(perchId);
  const envelope = INSECT_ENVELOPES[species];
  if (!perch) {
    return evaluateInsectPerchDiagnostic({
      perchId,
      unitIndex: -1,
      ownerId: null,
      occupantId: null,
      species,
      authoredAnchor: { x: 0, y: 0, z: 0 },
      resolvedContact: null,
      normal: null,
      tangent: null,
      eligibleSpecies: [],
      envelope,
      routes: [],
      collisionRevision: null,
      resolutionRejection: "perch-not-found",
    });
  }
  perch.anchor.getWorldPosition(DIAGNOSTIC_AUTHORED);
  const resolution = resolveInsectPerch(perch);
  let resolutionRejection: InsectPerchRejectionCode = "none";
  let target: InsectLandingTarget | null = null;
  if (!resolution.ok) {
    resolutionRejection = resolution.rejectionCode;
  } else {
    target = {
      id: perch.id,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      tangent: { x: 0, y: 0, z: 1 },
      clearance: envelope.contactLift,
    };
    if (!prepareInsectLandingTarget(perch.id, species, target))
      resolutionRejection = "no-visible-contact";
  }
  const cache = collisionCache(perch.unitIndex, now);
  const ownerId = insectPerchOwnerId(perch);
  const supportId = perch.resolvedSurface
    ? ownerId
      ? `owner:${ownerId}:mesh:${perch.resolvedSurface.uuid}`
      : `mesh:${perch.resolvedSurface.uuid}`
    : null;
  const support = cache ? collisionBoxById(cache.index, supportId) : null;
  const supportGroup = cache
    ? insectSupportGroup(cache.index, supportId, target?.point ?? null)
    : null;
  const restingPoseClear = Boolean(
    target &&
      cache &&
      support &&
      insectTerminalPoseIsClear(
        target.point,
        target.normal,
        target.tangent,
        envelope,
        cache.index,
        supportGroup,
        target
          ? {
              center: target.point,
              radius: envelope.sweepRadius * 1.6,
            }
          : null,
      ),
  );
  const collisionRevision = cache?.index.revision ?? null;
  const routeState =
    insectDiagnosticsController.diagnosticRouteStateForCollisionRevision(
      perch.id,
      collisionRevision,
    );
  return evaluateInsectPerchDiagnostic({
    perchId: perch.id,
    unitIndex: perch.unitIndex,
    ownerId,
    occupantId: insectPerchOccupant(perch.id),
    species,
    authoredAnchor: {
      x: DIAGNOSTIC_AUTHORED.x,
      y: DIAGNOSTIC_AUTHORED.y,
      z: DIAGNOSTIC_AUTHORED.z,
    },
    resolvedContact: target ? { ...target.point } : null,
    normal: target ? { ...target.normal } : null,
    tangent: target ? { ...target.tangent } : null,
    eligibleSpecies:
      perch.kind === "lamp" ? ["butterfly", "moth"] : ["butterfly"],
    envelope,
    routes: routeState.routes,
    collisionRevision,
    resolutionRejection,
    lit: species !== "moth" || perch.kind !== "lamp" || lampPerchIsLit(perch),
    supportPresent: Boolean(support),
    restingPoseClear,
    retainedRouteFailure: routeState.retainedFailure,
    automaticLandingsPaused,
    plannedCollisionRevision,
  });
}

/**
 * The Unit frame a landing stages through, cached per Unit.
 *
 * Staging is a property of the room, not of the insect: what makes a plank
 * passable is knowing which way is "out toward the camera" for that Unit. A
 * moth carries no Flight Volume of its own — it roams a lamp cone — but the
 * lamp still stands on a shelf with a plank over it, so it needs the same
 * frame to get out from under one.
 */
const UNIT_FLIGHT_VOLUMES = new Map<number, InsectFlightVolume>();
function unitFlightVolume(unitIndex: number) {
  let volume = UNIT_FLIGHT_VOLUMES.get(unitIndex);
  if (!volume) {
    volume = createInsectFlightVolume(unitPose(unitIndex));
    UNIT_FLIGHT_VOLUMES.set(unitIndex, volume);
  }
  return volume;
}

export class ThreeInsectFlightWorld implements InsectFlightWorld {
  private unitIndex = -1;
  private now = 0;
  private supportBoxId: string | null = null;
  private supportGroup: ReadonlySet<string> | null = null;
  private supportContactRegion: InsectSupportContactRegion | null = null;
  private reservedPerchId: string | null = null;

  constructor(
    readonly occupantId: string,
    readonly species: InsectSpecies,
    /** Absent for a steering resident, which has no analytic flight to copy. */
    private readonly cruiseSampler?: CruiseSampler,
  ) {}

  setContext(unitIndex: number, now: number) {
    this.unitIndex = unitIndex;
    this.now = now;
  }

  sampleCruise(flightId: number, time: number, out: InsectKinematicSample) {
    this.cruiseSampler?.(flightId, time, out);
  }

  /**
   * Soft-collision roaming reads the scene as a field rather than a verdict.
   * The collision index is already a plain list of AABBs, so this is exact
   * with no grid and no precompute, and it costs strictly less than the swept
   * corridor validation it replaces. The meadow is outside every per-Unit
   * root, so its floor is folded in explicitly.
   */
  sampleDistanceField(
    point: InsectLandingTarget["point"],
    outGradient: { x: number; y: number; z: number },
  ) {
    const cache = collisionCache(this.unitIndex, this.now);
    const ground = point.y - MEADOW_GROUND_BASE;
    const scene = cache
      ? insectDistanceField(point, cache.index, outGradient)
      : Number.POSITIVE_INFINITY;
    if (ground >= scene) return scene;
    outGradient.x = 0;
    outGradient.y = 1;
    outGradient.z = 0;
    return ground;
  }

  sweepSphere(
    from: InsectLandingTarget["point"],
    to: InsectLandingTarget["point"],
    radius: number,
    allowReservedSupportContact = false,
    allowPenetrationEscape = false,
  ) {
    // The meadow is outside every per-unit collision root, so enforce its
    // floor explicitly. Penetration recovery may escape scene props but may
    // never choose a downward route that puts the full wing sphere in soil.
    if (
      from.y - radius < MEADOW_GROUND_BASE ||
      to.y - radius < MEADOW_GROUND_BASE
    )
      return false;
    const cache = collisionCache(this.unitIndex, this.now);
    if (!cache) return false;
    TARGET_POINTS[0].x = from.x;
    TARGET_POINTS[0].y = from.y;
    TARGET_POINTS[0].z = from.z;
    TARGET_POINTS[1].x = to.x;
    TARGET_POINTS[1].y = to.y;
    TARGET_POINTS[1].z = to.z;
    return insectCorridorIsClear(
      TARGET_POINTS,
      radius,
      cache.index,
      allowReservedSupportContact ? this.supportGroup : null,
      allowPenetrationEscape,
      allowReservedSupportContact ? this.supportContactRegion : null,
    );
  }

  sweepFolded(
    from: InsectLandingTarget["point"],
    to: InsectLandingTarget["point"],
    normal: InsectLandingTarget["normal"],
    tangent: InsectLandingTarget["tangent"],
    allowReservedSupportContact = false,
  ) {
    const envelope = INSECT_ENVELOPES[this.species];
    // Keep the same hard meadow contract as flight. This intentionally uses
    // the larger flying radius and therefore cannot make a near-ground folded
    // pose less safe than the existing route system.
    if (
      from.y - envelope.sweepRadius < MEADOW_GROUND_BASE ||
      to.y - envelope.sweepRadius < MEADOW_GROUND_BASE
    )
      return false;
    const cache = collisionCache(this.unitIndex, this.now);
    if (!cache) return false;
    TARGET_POINTS[0].x = from.x;
    TARGET_POINTS[0].y = from.y;
    TARGET_POINTS[0].z = from.z;
    TARGET_POINTS[1].x = to.x;
    TARGET_POINTS[1].y = to.y;
    TARGET_POINTS[1].z = to.z;
    return insectFoldedCorridorIsClear(
      TARGET_POINTS,
      normal,
      tangent,
      envelope,
      cache.index,
      allowReservedSupportContact ? this.supportGroup : null,
      allowReservedSupportContact ? this.supportContactRegion : null,
    );
  }

  compileLandingPlan(
    request: Omit<
      InsectLandingPlanRequest,
      "sweep" | "foldedSweep" | "collisionRevision"
    >,
  ): InsectLandingPlanResult {
    // A new compiler attempt supersedes a previous route verdict. If this
    // attempt fails it publishes its own current-revision phase below.
    insectDiagnosticsController.clearRoutes(request.perchId);
    const diagnostic = diagnoseInsectPerch(
      request.perchId,
      this.species,
      this.now,
    );
    if (diagnostic.status !== "valid")
      return {
        ok: false,
        rejectionCode:
          diagnostic.rejectionCode === "none"
            ? "collision-index-unavailable"
            : diagnostic.rejectionCode,
      };
    const perch = getInsectPerch(request.perchId);
    const cache = perch ? collisionCache(perch.unitIndex, this.now) : null;
    if (!perch || !cache || !perch.resolvedSurface)
      return { ok: false, rejectionCode: "collision-index-unavailable" };
    const ownerId = insectPerchOwnerId(perch);
    const supportBoxId = ownerId
      ? `owner:${ownerId}:mesh:${perch.resolvedSurface.uuid}`
      : `mesh:${perch.resolvedSurface.uuid}`;
    const supportContactRegion: InsectSupportContactRegion = {
      center: { ...request.target.point },
      radius: request.profile.wingRadius * 1.6,
    };
    const supportGroup = insectSupportGroup(
      cache.index,
      supportBoxId,
      request.target.point,
    );
    const compiled = compileInsectLandingPlan({
      ...request,
      volume: request.volume ?? unitFlightVolume(perch.unitIndex),
      collisionRevision: cache.index.revision,
      foldedSweep: (_phase, from, to) => {
        const routeRadius = request.profile.wingRadius + INSECT_PLAN_DILATION;
        if (
          from.y - routeRadius < MEADOW_GROUND_BASE ||
          to.y - routeRadius < MEADOW_GROUND_BASE
        )
          return false;
        return insectFoldedCorridorIsClear(
          [from, to],
          request.target.normal,
          request.target.tangent,
          // Dilated, for the same reason the sphere is: the pilot flies the
          // hover arc and the touchdown with the folded pose, and it tracks
          // them rather than replaying them (ADR 0005).
          INSECT_PLAN_ENVELOPES[this.species],
          cache.index,
          supportGroup,
          supportContactRegion,
        );
      },
      sweep: (phase, from, to) => {
        // Plan dilated, fly exact (ADR 0005). The pilot TRACKS this route with
        // finite gain and jerk limits rather than replaying it, which is what
        // keeps the motion from reading as a machine following a spline — and
        // means it deviates by a centimetre or two. Validating with a slightly
        // larger radius than the one the pilot is swept against absorbs that
        // by construction instead of making it fatal.
        const routeRadius = request.profile.wingRadius + INSECT_PLAN_DILATION;
        if (
          from.y - routeRadius < MEADOW_GROUND_BASE ||
          to.y - routeRadius < MEADOW_GROUND_BASE
        )
          return false;
        // The Arrival Curve spirals inward rather than holding station at a
        // fixed standoff, so `hover` is already close enough to the reserved
        // support to graze it. It keeps the exception; every other collider is
        // still hard, and `approach` still has none.
        const supportPhase =
          phase === "hover" || phase === "touchdown" || phase === "launch";
        return insectCorridorIsClear(
          [from, to],
          routeRadius,
          cache.index,
          supportPhase ? supportGroup : null,
          false,
          supportPhase ? supportContactRegion : null,
        );
      },
    });
    if (process.env.NODE_ENV === "development") {
      if (compiled.ok) {
        insectDiagnosticsController.publishRoutes(
          request.perchId,
          cache.index.revision,
          (["approach", "hover", "touchdown", "launch", "rejoin"] as const).map(
            (phase) => ({ phase, points: compiled.plan[phase], clear: true }),
          ),
        );
      } else if (
        [
          "approach-blocked",
          "hover-blocked",
          "touchdown-blocked",
          "launch-blocked",
          "rejoin-blocked",
        ].includes(compiled.rejectionCode)
      ) {
        const phase = compiled.rejectionCode.replace("-blocked", "") as
          | "approach"
          | "hover"
          | "touchdown"
          | "launch"
          | "rejoin";
        insectDiagnosticsController.publishRoutes(
          request.perchId,
          cache.index.revision,
          [{ phase, points: [], clear: false }],
        );
      }
    }
    return compiled;
  }

  tryReserve(
    perchId: string,
    occupantId: string,
    plannedCollisionRevision: number | null = null,
  ) {
    if (occupantId !== this.occupantId)
      return { ok: false, rejectionCode: "occupied" } as const;
    const diagnostic = diagnoseInsectPerch(
      perchId,
      this.species,
      this.now,
      false,
      plannedCollisionRevision,
    );
    if (diagnostic.status !== "valid")
      return {
        ok: false,
        rejectionCode:
          diagnostic.rejectionCode === "none"
            ? "collision-index-unavailable"
            : diagnostic.rejectionCode,
      } as const;
    if (!claimInsectPerch(perchId, occupantId)) {
      const failed = diagnoseInsectPerch(
        perchId,
        this.species,
        this.now,
        false,
        plannedCollisionRevision,
      );
      return {
        ok: false,
        rejectionCode:
          failed.rejectionCode === "none" ? "occupied" : failed.rejectionCode,
      } as const;
    }
    const fail = (rejectionCode: Exclude<InsectPerchRejectionCode, "none">) => {
      releaseInsectPerch(perchId, occupantId);
      this.supportBoxId = null;
      this.supportGroup = null;
      this.supportContactRegion = null;
      return { ok: false, rejectionCode } as const;
    };
    const perch = getInsectPerch(perchId);
    if (!perch) return fail("perch-not-found");
    this.unitIndex = perch.unitIndex;
    const ownerId = insectPerchOwnerId(perch);
    this.supportBoxId = perch.resolvedSurface
      ? ownerId
        ? `owner:${ownerId}:mesh:${perch.resolvedSurface.uuid}`
        : `mesh:${perch.resolvedSurface.uuid}`
      : null;
    const cache = collisionCache(this.unitIndex, this.now, true);
    if (!cache) return fail("collision-index-unavailable");
    // The validation above may have used a still-fresh cached index. Claiming
    // force-rebuilds bounds so a prop movement in the planning/reservation
    // gap cannot silently admit a plan compiled against stale geometry.
    if (
      plannedCollisionRevision != null &&
      cache.index.revision !== plannedCollisionRevision
    )
      return fail("stale-collision-revision");
    if (!readInsectPerchWorld(perch, POSITION, NORMAL, QUATERNION))
      return fail("no-visible-contact");
    this.supportContactRegion = {
      center: { x: POSITION.x, y: POSITION.y, z: POSITION.z },
      radius: INSECT_ENVELOPES[this.species].sweepRadius * 1.6,
    };
    const target: InsectLandingTarget = {
      id: perch.id,
      point: { x: POSITION.x, y: POSITION.y, z: POSITION.z },
      normal: { x: NORMAL.x, y: NORMAL.y, z: NORMAL.z },
      tangent: { x: 1, y: 0, z: 0 },
      clearance: INSECT_ENVELOPES[this.species].contactLift,
    };
    prepareInsectLandingTarget(perch.id, this.species, target);
    const support = collisionBoxById(cache.index, this.supportBoxId);
    const envelope = INSECT_ENVELOPES[this.species];
    if (!support) return fail("support-missing");
    this.supportGroup = insectSupportGroup(
      cache.index,
      this.supportBoxId,
      target.point,
    );
    if (
      !insectTerminalPoseIsClear(
        target.point,
        target.normal,
        target.tangent,
        envelope,
        cache.index,
        this.supportGroup,
        this.supportContactRegion,
      )
    )
      return fail("resting-pose-blocked");
    this.reservedPerchId = perchId;
    return { ok: true } as const;
  }

  release(perchId: string, occupantId: string) {
    releaseInsectPerch(perchId, occupantId);
    if (this.reservedPerchId === perchId) {
      this.reservedPerchId = null;
      this.supportBoxId = null;
      this.supportGroup = null;
      this.supportContactRegion = null;
    }
  }

  terminalPoseIsClear(target: InsectLandingTarget) {
    const cache = collisionCache(this.unitIndex, this.now);
    const support = cache
      ? collisionBoxById(cache.index, this.supportBoxId)
      : null;
    const envelope = INSECT_ENVELOPES[this.species];
    return Boolean(
      cache &&
        support &&
        insectTerminalPoseIsClear(
          target.point,
          target.normal,
          target.tangent,
          envelope,
          cache.index,
          this.supportGroup,
          this.supportContactRegion,
        ),
    );
  }

  dispose() {
    if (this.reservedPerchId)
      this.release(this.reservedPerchId, this.occupantId);
  }
}
