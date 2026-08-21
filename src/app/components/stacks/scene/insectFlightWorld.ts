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
  insectFlightVolumeLocal,
  insectFlightVolumePoint,
} from "./insectFlightVolume";
import {
  type InsectLandingPlanRequest,
  type InsectLandingPlanResult,
  compileInsectLandingPlan,
} from "./insectLanding";
import {
  type InsectDiagnosticRoute,
  type InsectPerchDiagnostic,
  type InsectPerchRejectionCode,
  evaluateInsectPerchDiagnostic,
  insectDiagnosticsController,
} from "./insectPerchDiagnostic";
import {
  type InsectPerch,
  claimInsectPerch,
  getInsectPerch,
  insectPerchAcceptsMoth,
  insectPerchMothLightIsOn,
  insectPerchOccupant,
  insectPerchOwnerId,
  readInsectPerchWorld,
  releaseInsectPerch,
  resolveInsectPerch,
} from "./insectPerches";
import {
  BUTTERFLY_PILOT_PROFILE,
  type InsectFlightWorld,
  type InsectKinematicSample,
  type InsectLandingTarget,
  MOTH_PILOT_PROFILE,
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
/** One shared bound for planning, reservation, runtime sweeps, and previews. */
const SUPPORT_CONTACT_REGION_SCALE = 1.65;

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
    // A transparent material that does not write depth is decoration — a glow
    // shell, a light pool, an overlay — and decoration is not something an
    // insect can be stopped by.
    //
    // The opacity floor alone was not this test. Each meadow lamp draws a 40 cm
    // light pool at opacity 0.0585, which cleared a 0.05 threshold by eight
    // thousandths and entered the collision index as solid geometry: it blocked
    // the resting pose on every desk-lamp shade (the "the light is red"
    // report), and, because the distance field reads the same boxes, quietly
    // pushed roaming insects away from every lamp in the room. Depth writing is
    // the property that actually distinguishes an occluder from a glow, so it
    // is what gets tested; the opacity floor stays for depth-writing meshes
    // that have faded out.
    (!material.transparent || (material.depthWrite && material.opacity > 0.05))
  );
}

function meshWritesVisibleColor(mesh: THREE.Mesh) {
  const data = mesh.userData as { physicsIgnore?: boolean };
  if (!mesh.visible || !mesh.geometry || data.physicsIgnore === true)
    return false;
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

/**
 * Development aid: name the mesh behind a collision box id.
 *
 * A blocked-pose report that says `mesh:9b77cebb-…` is unactionable — the whole
 * question is WHICH prop that is, and whether it should have been a collider at
 * all. The ancestor chain answers both.
 */
export function describeInsectCollisionBox(unitIndex: number, boxId: string) {
  const root = ROOTS.get(unitIndex);
  if (!root) return null;
  const uuid = boxId.slice(boxId.lastIndexOf(":") + 1);
  const matches: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.uuid === uuid) matches.push(object);
  });
  const target = matches[0];
  if (!target) return null;
  const chain: string[] = [];
  for (
    let node: THREE.Object3D | null = target;
    node && node !== root.parent;
    node = node.parent
  )
    chain.push(node.name || `<${node.type}>`);
  const mesh = target as THREE.Mesh;
  let bounds: {
    min: [number, number, number];
    max: [number, number, number];
  } | null = null;
  if (mesh.isMesh && mesh.geometry) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      BOX.copy(mesh.geometry.boundingBox);
      target.updateWorldMatrix(true, false);
      BOX.applyMatrix4(target.matrixWorld);
      bounds = {
        min: [BOX.min.x, BOX.min.y, BOX.min.z],
        max: [BOX.max.x, BOX.max.y, BOX.max.z],
      };
    }
  }
  const material = Array.isArray(mesh.material)
    ? mesh.material[0]
    : mesh.material;
  return {
    uuid,
    chain,
    bounds,
    // Glow shells, light pools and similar decoration are not things an insect
    // can stand on OR be stopped by, so telling them apart from real geometry
    // is the whole question when one of them blocks a pose.
    material: material
      ? {
          type: material.type,
          name: material.name,
          transparent: material.transparent,
          opacity: material.opacity,
          depthWrite: material.depthWrite,
        }
      : null,
    // Whether any registered interaction claims it. An unowned mesh is exactly
    // the case `insectSupportGroup` can only forgive by containment, so this is
    // the field that says whether a blocked pose is a support-grouping problem
    // or a genuine neighbour.
    ownedBy:
      sceneInteractionInventory().find(
        (interaction) =>
          interaction.activeUnits.includes(unitIndex) &&
          isInside(target, interaction.root),
      )?.id ?? null,
  };
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
const SPREAD_RAY = new THREE.Raycaster();
const SPREAD_ORIGIN = new THREE.Vector3();
const SPREAD_DIRECTION = new THREE.Vector3();
const SPREAD_BITANGENT = new THREE.Vector3();
const SPREAD_HITS: THREE.Intersection[] = [];
const SPREAD_NORMAL_MATRIX = new THREE.Matrix3();
const SPREAD_HIT_NORMAL = new THREE.Vector3();
/** cos(31°). Tight enough that a displaced contact is the same kind of surface
 * the Perch was authored on. */
const LANDING_SPREAD_NORMAL_AGREEMENT = 0.857;

/**
 * How far across a Perch's own surface a landing may be displaced, in metres.
 *
 * Every arrival at a Perch used to touch down on the identical millimetre,
 * because the resolved contact is a single point and nothing downstream ever
 * varied it — so two butterflies on the same book landed in exactly the same
 * spot, one after the other. Owner review: "can we add more variation to
 * landing position?"
 *
 * Three centimetres is about a wingspan, big enough to read as a different
 * choice and small enough that a Perch stays the place it was authored to be.
 */
const LANDING_SPREAD_RADIUS = 0.03;

/**
 * Displace a contact across the support and RE-PROJECT it onto the real
 * triangles.
 *
 * Offsetting in the tangent plane alone would be wrong: most Perches are on
 * small props — a can lid, a shaker rim, a book edge — where three centimetres
 * of lateral drift walks straight off the surface into thin air, or floats
 * above a face that curves away. Casting back down the normal onto the same
 * mesh keeps the displaced contact ON the prop, and falls back to the exact
 * resolved point whenever the ray misses, which is what makes this safe to
 * apply everywhere rather than only where it was checked.
 */
function spreadLandingContact(
  perch: InsectPerch,
  spread: number,
  point: THREE.Vector3,
  normal: THREE.Vector3,
) {
  const surface = perch.resolvedSurface;
  if (!surface || spread <= 0) return;
  // Two decorrelated values out of one: a golden-angle turn so successive
  // attempts spiral around the site rather than clustering, and √r so the
  // offsets are spread evenly over the disc instead of bunching at the centre.
  const angle = spread * Math.PI * 2 * 4.2360679;
  const radius = Math.sqrt(spread) * LANDING_SPREAD_RADIUS;
  SPREAD_DIRECTION.set(normal.x, normal.y, normal.z).normalize();
  SPREAD_BITANGENT.set(0, 1, 0);
  if (Math.abs(SPREAD_DIRECTION.y) > 0.9) SPREAD_BITANGENT.set(1, 0, 0);
  SPREAD_BITANGENT.crossVectors(SPREAD_DIRECTION, SPREAD_BITANGENT).normalize();
  SPREAD_ORIGIN.copy(SPREAD_BITANGENT).multiplyScalar(Math.cos(angle) * radius);
  SPREAD_BITANGENT.crossVectors(SPREAD_DIRECTION, SPREAD_BITANGENT);
  SPREAD_ORIGIN.addScaledVector(SPREAD_BITANGENT, Math.sin(angle) * radius);
  // Start clear of the surface and cast back into it.
  SPREAD_ORIGIN.add(point).addScaledVector(SPREAD_DIRECTION, 0.06);
  SPREAD_DIRECTION.multiplyScalar(-1);
  SPREAD_RAY.set(SPREAD_ORIGIN, SPREAD_DIRECTION);
  SPREAD_HITS.length = 0;
  SPREAD_RAY.intersectObject(surface, false, SPREAD_HITS);
  const hit = SPREAD_HITS.find((candidate) => candidate.face);
  if (!hit?.face) return;
  // Three guards, because "landed on a real triangle" is not the same as
  // "standing on the prop". A ray can pass through a hole and strike the far
  // inside of a shade, or catch a downward-facing face, and either would put an
  // insect in mid-air holding a contact that technically exists.
  //
  // 1. The face must be oriented like the Perch — no undersides, no flanks.
  SPREAD_NORMAL_MATRIX.getNormalMatrix(surface.matrixWorld);
  SPREAD_HIT_NORMAL.copy(hit.face.normal)
    .applyMatrix3(SPREAD_NORMAL_MATRIX)
    .normalize();
  if (SPREAD_HIT_NORMAL.dot(normal) < LANDING_SPREAD_NORMAL_AGREEMENT) return;
  // 2. It must be near the authored site, not somewhere else on the same mesh.
  if (hit.point.distanceTo(point) > LANDING_SPREAD_RADIUS * 1.6) return;
  // 3. And it must not sit below the plane the Perch was authored on, which is
  //    the one thing that would read unambiguously as sunk rather than moved.
  if (
    (hit.point.x - point.x) * normal.x +
      (hit.point.y - point.y) * normal.y +
      (hit.point.z - point.z) * normal.z <
    -LANDING_SPREAD_RADIUS
  )
    return;
  point.copy(hit.point);
}

export function prepareInsectLandingTarget(
  perchId: string,
  species: InsectSpecies,
  out: InsectLandingTarget,
  /** 0..1, stable for the life of one landing attempt. See
   * `LANDING_SPREAD_RADIUS`. */
  spread = 0,
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
  spreadLandingContact(perch, spread, POSITION, NORMAL);
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

const LANDING_PHASES = [
  "approach",
  "hover",
  "touchdown",
  "launch",
  "rejoin",
] as const;

const PREVIEW_PROFILES = {
  butterfly: BUTTERFLY_PILOT_PROFILE,
  moth: MOTH_PILOT_PROFILE,
} as const;

const PREVIEW_TARGET: InsectLandingTarget = {
  id: "",
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  tangent: { x: 0, y: 0, z: 1 },
  clearance: 0,
};
const PREVIEW_START: InsectKinematicSample = {
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  acceleration: { x: 0, y: 0, z: 0 },
};
const PREVIEW_LOCAL = { x: 0, y: 0, z: 0 };
const PREVIEW_WORLD = { x: 0, y: 0, z: 0 };

/** How far in front of the Unit's front face the notional visitor starts. */
const PREVIEW_STANDOFF = 0.35;

/**
 * The approach and departure corridors for a Perch nobody is currently flying
 * to, for the review overlay.
 *
 * The Routes toggle drew almost nothing, and the reason is that route geometry
 * only ever existed as a by-product of a real landing: the compiler published
 * what it swept, so a Perch had a drawn route only for the six seconds after an
 * insect happened to attempt it, and a FAILED attempt published its phase with
 * an empty point list — which the overlay skips. So the one case worth looking
 * at, "why can nothing get in here", was the one case that drew nothing at all.
 * Owner review: "I don't think approach and departure route debug is working?"
 *
 * This asks the question the overlay is actually for — can an insect coming
 * from open air in front of this shelf get in and back out — and always answers
 * with geometry. It compiles honestly first; if that fails it recompiles with
 * the sweeps disabled, which always yields the first-choice curve, and then
 * sweeps that curve segment by segment so the blocked phase draws in red
 * exactly where it is blocked.
 *
 * It deliberately does NOT publish into the controller. Verdict routes are
 * evidence about attempts real insects made, and feeding synthetic attempts
 * into the same channel would drive the failure escalation that turns a Perch
 * red — the overlay would then be reporting its own probing.
 */
export function previewInsectPerchRoutes(
  perchId: string,
  species: InsectSpecies,
  now: number,
): readonly InsectDiagnosticRoute[] {
  const perch = getInsectPerch(perchId);
  if (!perch) return [];
  if (!prepareInsectLandingTarget(perchId, species, PREVIEW_TARGET)) return [];
  const cache = collisionCache(perch.unitIndex, now);
  if (!cache || !perch.resolvedSurface) return [];
  const ownerId = insectPerchOwnerId(perch);
  const supportGroup = insectSupportGroup(
    cache.index,
    ownerId
      ? `owner:${ownerId}:mesh:${perch.resolvedSurface.uuid}`
      : `mesh:${perch.resolvedSurface.uuid}`,
    PREVIEW_TARGET.point,
  );
  const profile = PREVIEW_PROFILES[species];
  const supportContactRegion: InsectSupportContactRegion = {
    center: { ...PREVIEW_TARGET.point },
    radius: profile.wingRadius * SUPPORT_CONTACT_REGION_SCALE,
  };
  // A notional visitor hovering in the open air in front of the furniture, at
  // the site's own height. Any fixed world point would be inside a shelf for
  // some Unit; the Unit frame is the only thing that knows which way is out.
  const volume = unitFlightVolume(perch.unitIndex);
  insectFlightVolumeLocal(volume, PREVIEW_TARGET.point, PREVIEW_LOCAL);
  insectFlightVolumePoint(
    volume,
    {
      x: PREVIEW_LOCAL.x,
      y: PREVIEW_LOCAL.y + 0.18,
      z: volume.extent.maxZ + PREVIEW_STANDOFF,
    },
    PREVIEW_WORLD,
  );
  PREVIEW_START.position.x = PREVIEW_WORLD.x;
  PREVIEW_START.position.y = PREVIEW_WORLD.y;
  PREVIEW_START.position.z = PREVIEW_WORLD.z;
  const toward = {
    x: PREVIEW_TARGET.point.x - PREVIEW_WORLD.x,
    y: PREVIEW_TARGET.point.y - PREVIEW_WORLD.y,
    z: PREVIEW_TARGET.point.z - PREVIEW_WORLD.z,
  };
  const distance = Math.max(1e-6, Math.hypot(toward.x, toward.y, toward.z));
  PREVIEW_START.velocity.x = (toward.x / distance) * profile.approachSpeed;
  PREVIEW_START.velocity.y = (toward.y / distance) * profile.approachSpeed;
  PREVIEW_START.velocity.z = (toward.z / distance) * profile.approachSpeed;
  PREVIEW_START.acceleration.x = 0;
  PREVIEW_START.acceleration.y = 0;
  PREVIEW_START.acceleration.z = 0;

  const routeRadius = profile.wingRadius + INSECT_PLAN_DILATION;
  const sweep = (
    _phase: (typeof LANDING_PHASES)[number],
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ) => {
    if (
      from.y - routeRadius < MEADOW_GROUND_BASE ||
      to.y - routeRadius < MEADOW_GROUND_BASE
    )
      return false;
    return insectCorridorIsClear(
      [from, to],
      routeRadius,
      cache.index,
      supportGroup,
      false,
      supportContactRegion,
    );
  };
  const foldedSweep = (
    _phase: "hover" | "touchdown" | "launch",
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ) => {
    if (
      from.y - routeRadius < MEADOW_GROUND_BASE ||
      to.y - routeRadius < MEADOW_GROUND_BASE
    )
      return false;
    return insectFoldedCorridorIsClear(
      [from, to],
      PREVIEW_TARGET.normal,
      PREVIEW_TARGET.tangent,
      INSECT_PLAN_ENVELOPES[species],
      cache.index,
      supportGroup,
      supportContactRegion,
    );
  };
  const request = {
    perchId,
    collisionRevision: cache.index.revision,
    start: PREVIEW_START,
    target: PREVIEW_TARGET,
    rejoin: null,
    volume,
    profile,
  };
  const strict = compileInsectLandingPlan({ ...request, sweep, foldedSweep });
  if (strict.ok)
    return LANDING_PHASES.map((phase) => ({
      phase,
      points: strict.plan[phase],
      clear: true,
    }));
  const loose = compileInsectLandingPlan({
    ...request,
    sweep: () => true,
    foldedSweep: () => true,
  });
  if (!loose.ok) return [];
  return LANDING_PHASES.map((phase) => {
    const points = loose.plan[phase];
    let clear = true;
    for (let index = 1; index < points.length && clear; index++)
      clear = sweep(phase, points[index - 1]!, points[index]!);
    return { phase, points, clear };
  });
}

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
  const restingPoseBlocker: { id: string | null } = { id: null };
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
              radius: envelope.sweepRadius * SUPPORT_CONTACT_REGION_SCALE,
            }
          : null,
        restingPoseBlocker,
      ),
  );
  const collisionRevision = cache?.index.revision ?? null;
  const routeState =
    insectDiagnosticsController.diagnosticRouteStateForCollisionRevision(
      perch.id,
      collisionRevision,
      now,
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
    eligibleSpecies: insectPerchAcceptsMoth(perch)
      ? ["butterfly", "moth"]
      : ["butterfly"],
    envelope,
    routes: routeState.routes,
    collisionRevision,
    resolutionRejection,
    // A moth wants a lit site whether it is landing on the fixture or on the
    // shelf beside it; a butterfly does not care.
    lit: species !== "moth" || insectPerchMothLightIsOn(perch),
    supportPresent: Boolean(support),
    restingPoseClear,
    restingPoseBlockedBy: restingPoseBlocker.id,
    occupantAtRest:
      insectDiagnosticsController.occupantPhase(
        insectPerchOccupant(perch.id),
      ) === "rest",
    routeBlockedBy: insectDiagnosticsController.routeBlocker(perch.id),
    displayRoutes: insectDiagnosticsController.routesForDisplay(perch.id, now),
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
      radius: request.profile.wingRadius * SUPPORT_CONTACT_REGION_SCALE,
    };
    const supportGroup = insectSupportGroup(
      cache.index,
      supportBoxId,
      request.target.point,
    );
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
      volume: request.volume ?? unitFlightVolume(perch.unitIndex),
      collisionRevision: cache.index.revision,
      foldedSweep: (_phase, from, to) => {
        const routeRadius = request.profile.wingRadius + INSECT_PLAN_DILATION;
        if (
          from.y - routeRadius < MEADOW_GROUND_BASE ||
          to.y - routeRadius < MEADOW_GROUND_BASE
        )
          return false;
        const folded = insectFoldedCorridorIsClear(
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
        if (
          from.y - routeRadius < MEADOW_GROUND_BASE ||
          to.y - routeRadius < MEADOW_GROUND_BASE
        )
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
          cache.index,
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
      insectDiagnosticsController.publishRouteBlocker(request.perchId, worst);
    }
    if (process.env.NODE_ENV === "development") {
      if (compiled.ok) {
        insectDiagnosticsController.publishRoutes(
          request.perchId,
          cache.index.revision,
          (["approach", "hover", "touchdown", "launch", "rejoin"] as const).map(
            (phase) => ({ phase, points: compiled.plan[phase], clear: true }),
          ),
          this.now,
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
          this.now,
        );
      }
    }
    return compiled;
  }

  tryReserve(
    perchId: string,
    occupantId: string,
    plannedCollisionRevision: number | null = null,
    plannedTarget?: InsectLandingTarget,
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
    // Reservation must retain the exact triangle-projected spread contact the
    // planner accepted. Re-preparing the Perch without its attempt variation
    // silently moved the runtime support licence back to the authored centre;
    // on the sailboat's shared hull-and-mast AABB, that was enough for a plan
    // to compile and then abort during hover.
    const target: InsectLandingTarget =
      plannedTarget?.id === perch.id
        ? {
            id: plannedTarget.id,
            point: { ...plannedTarget.point },
            normal: { ...plannedTarget.normal },
            tangent: { ...plannedTarget.tangent },
            clearance: plannedTarget.clearance,
            approachDistance: plannedTarget.approachDistance,
            approachLateral: plannedTarget.approachLateral,
          }
        : {
            id: perch.id,
            point: { x: POSITION.x, y: POSITION.y, z: POSITION.z },
            normal: { x: NORMAL.x, y: NORMAL.y, z: NORMAL.z },
            tangent: { x: 1, y: 0, z: 0 },
            clearance: INSECT_ENVELOPES[this.species].contactLift,
          };
    if (!plannedTarget)
      prepareInsectLandingTarget(perch.id, this.species, target);
    this.supportContactRegion = {
      center: { ...target.point },
      radius:
        INSECT_ENVELOPES[this.species].sweepRadius *
        SUPPORT_CONTACT_REGION_SCALE,
    };
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
