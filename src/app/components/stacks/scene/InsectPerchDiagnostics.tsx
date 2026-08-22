"use client";

import { UNIT_COUNT } from "../data";
import { useStacks } from "../store";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useSyncExternalStore } from "react";
import * as THREE from "three";

import type { CollisionPoint } from "./insectCollision";
import {
  type InsectFlightVolume,
  createInsectFlightVolume,
  insectFlightVolumeLocal,
  insectFlightVolumePoint,
} from "./insectFlightVolume";
import {
  describeInsectCollisionBox,
  diagnoseInsectPerch,
  previewInsectPerchRoutes,
} from "./insectFlightWorld";
import type {
  InsectDiagnosticRoute,
  InsectLampConeOutline,
} from "./insectPerchDiagnostic";
import {
  type InsectDiagnosticsSnapshot,
  type InsectPerchDiagnostic,
  insectDiagnosticsController,
  insectDiagnosticsEnabled,
} from "./insectPerchDiagnostic";
import { getInsectPerches } from "./insectPerches";
import {
  sceneInteractionInventory,
  sceneInteractionRoots,
} from "./interactionRegistry";
import { markSceneFrameInstrumented } from "./sceneFrameCost";
import { unitPose } from "./worldLayout";

const NO_RAYCAST = () => null;
/** One colour per resident slot, so a shared line between two residents of the
 * same shelf is visible as two colours running together rather than one. */
const TRAIL_COLORS = ["#ffd65a", "#7ddcff", "#ff9ad5"] as const;

/** The twelve edges of one Flight Volume, drawn as a single stroke so the
 * overlay costs one Line per Unit. Duplicated corners in the walk are what let
 * one polyline close every edge. */
function flightVolumeOutline(volume: InsectFlightVolume) {
  const extent = volume.extent;
  const local = (x: number, y: number, z: number) => {
    const out = { x: 0, y: 0, z: 0 };
    insectFlightVolumePoint(volume, { x, y, z }, out);
    return [out.x, out.y, out.z] as const;
  };
  const [w, minY, maxY, minZ, maxZ] = [
    extent.halfWidth,
    extent.minY,
    extent.maxY,
    extent.minZ,
    extent.maxZ,
  ];
  return [
    local(-w, minY, minZ),
    local(w, minY, minZ),
    local(w, minY, maxZ),
    local(-w, minY, maxZ),
    local(-w, minY, minZ),
    local(-w, maxY, minZ),
    local(w, maxY, minZ),
    local(w, minY, minZ),
    local(w, maxY, minZ),
    local(w, maxY, maxZ),
    local(w, minY, maxZ),
    local(w, maxY, maxZ),
    local(-w, maxY, maxZ),
    local(-w, minY, maxZ),
    local(-w, maxY, maxZ),
    local(-w, maxY, minZ),
  ];
}

const OWNER_BOX = new THREE.Box3();
const OWNER_SIZE = new THREE.Vector3();
const OWNER_CENTER = new THREE.Vector3();
const OWNER_LOCAL = { x: 0, y: 0, z: 0 };
const OWNER_FRAMES = Array.from({ length: UNIT_COUNT }, (_, unitIndex) =>
  createInsectFlightVolume(unitPose(unitIndex)),
);

/**
 * Every interaction currently mounted on `unitIndex`, with the top of its
 * world bounds resolved into that Unit's own frame — the same frame Perch
 * anchors are authored in.
 *
 * This exists for one job: choosing WHICH prop a new Perch should sit on, and
 * roughly where. It is emphatically not a source of authored coordinates. A
 * bounding box is the wrong answer to "where can an insect stand": the
 * sailboat's mast shares one mesh with its hull, so its box top is 13 cm above
 * any surface a probe can actually hit. Author the candidate from this, then
 * copy back the contact the resolver measures.
 */
const PROBE_RAY = new THREE.Raycaster();
const PROBE_DOWN = new THREE.Vector3(0, -1, 0);
const PROBE_ORIGIN = new THREE.Vector3();
const PROBE_NORMAL_MATRIX = new THREE.Matrix3();
const PROBE_NORMAL = new THREE.Vector3();
const PROBE_MESHES: THREE.Object3D[] = [];
const PROBE_HITS: THREE.Intersection[] = [];
const PROBE_BOX = new THREE.Box3();

/**
 * The height and normal of the topmost real triangle above each point of a grid
 * over one owner, in that Unit's own frame.
 *
 * Authored from a bounding box, `training:navy-shaker-rim` resolved nine
 * centimetres below the lid: the cap is far narrower than the body, so an
 * offset that looked like "most of the way to the rim" was actually out on the
 * body's shoulder, standing beside the cap — which is precisely the
 * `resting-pose-blocked` this was meant to escape. A box cannot express that
 * and a second guess is just a slower guess.
 *
 * Reading the surface directly is the difference between authoring a Perch and
 * proposing one. The `clear` column is the headroom above each hit, which is
 * what actually decides whether a folded insect fits there.
 */
function probeInteractionSurface(
  unitIndex: number,
  ownerId: string,
  steps = 9,
) {
  const frame = OWNER_FRAMES[unitIndex];
  // Every registered part, for the same reason `resolveInsectPerch` unions
  // them: the elected carrier of a movable prop can be a handle with nothing
  // under it.
  const roots = sceneInteractionRoots(ownerId);
  if (!frame || roots.length === 0) return null;
  OWNER_BOX.makeEmpty();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    PROBE_BOX.setFromObject(root, true);
    if (!PROBE_BOX.isEmpty()) OWNER_BOX.union(PROBE_BOX);
  }
  if (OWNER_BOX.isEmpty()) return null;
  OWNER_BOX.getSize(OWNER_SIZE);
  OWNER_BOX.getCenter(OWNER_CENTER);
  PROBE_MESHES.length = 0;
  const seen = new Set<THREE.Object3D>();
  for (const root of roots)
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && !seen.has(object)) {
        seen.add(object);
        PROBE_MESHES.push(object);
      }
    });
  const rows: {
    local: [number, number, number];
    normal: [number, number, number];
    clear: number;
  }[] = [];
  for (let ix = 0; ix < steps; ix++)
    for (let iz = 0; iz < steps; iz++) {
      const x = OWNER_BOX.min.x + (OWNER_SIZE.x * (ix + 0.5)) / steps;
      const z = OWNER_BOX.min.z + (OWNER_SIZE.z * (iz + 0.5)) / steps;
      PROBE_ORIGIN.set(x, OWNER_BOX.max.y + 0.5, z);
      PROBE_RAY.set(PROBE_ORIGIN, PROBE_DOWN);
      PROBE_HITS.length = 0;
      PROBE_RAY.intersectObjects(PROBE_MESHES, false, PROBE_HITS);
      const hit = PROBE_HITS.find((candidate) => candidate.face);
      if (!hit?.face) continue;
      PROBE_NORMAL_MATRIX.getNormalMatrix(hit.object.matrixWorld);
      PROBE_NORMAL.copy(hit.face.normal)
        .applyMatrix3(PROBE_NORMAL_MATRIX)
        .normalize();
      if (PROBE_NORMAL.y < 0) PROBE_NORMAL.multiplyScalar(-1);
      insectFlightVolumeLocal(frame, hit.point, OWNER_LOCAL);
      rows.push({
        local: [
          Number(OWNER_LOCAL.x.toFixed(4)),
          Number(OWNER_LOCAL.y.toFixed(4)),
          Number(OWNER_LOCAL.z.toFixed(4)),
        ],
        normal: [
          Number(PROBE_NORMAL.x.toFixed(4)),
          Number(PROBE_NORMAL.y.toFixed(4)),
          Number(PROBE_NORMAL.z.toFixed(4)),
        ],
        clear: Number((OWNER_BOX.max.y - hit.point.y).toFixed(4)),
      });
    }
  return rows;
}

const SIDE_ORIGIN = new THREE.Vector3();
const SIDE_DIRECTION = new THREE.Vector3();

/**
 * The outward-facing FLANK of one owner: rays fired inward at the prop's
 * vertical axis, from a ring of bearings at a ladder of heights.
 *
 * `probeInteractionSurface` casts straight down, so it can only ever find
 * surfaces an insect would stand on top of — a vertical shade wall is
 * invisible to it, and every Perch authored from it therefore sits on a lid.
 * Owner review: "for the lights can we have the butterflies and moths land on
 * the side rather than on top? Especially for the big floor one." A lamp is the
 * one prop where the side is the better site: it is where the light actually
 * is, it is the half a visitor sees, and the top of a shade is a place moths do
 * not go.
 *
 * `bearing` is the compass angle the ray came FROM, so the returned normal
 * should point back along it; a normal that does not is a hit on some interior
 * face and not somewhere anything can stand.
 */
function probeInteractionFlank(unitIndex: number, ownerId: string, rings = 5) {
  const frame = OWNER_FRAMES[unitIndex];
  const roots = sceneInteractionRoots(ownerId);
  if (!frame || roots.length === 0) return null;
  OWNER_BOX.makeEmpty();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    PROBE_BOX.setFromObject(root, true);
    if (!PROBE_BOX.isEmpty()) OWNER_BOX.union(PROBE_BOX);
  }
  if (OWNER_BOX.isEmpty()) return null;
  OWNER_BOX.getSize(OWNER_SIZE);
  OWNER_BOX.getCenter(OWNER_CENTER);
  PROBE_MESHES.length = 0;
  const seen = new Set<THREE.Object3D>();
  for (const root of roots)
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && !seen.has(object)) {
        seen.add(object);
        PROBE_MESHES.push(object);
      }
    });
  // Comfortably outside the box on every bearing, so no ray starts inside the
  // prop and misses the wall it was aimed at.
  const reach = Math.hypot(OWNER_SIZE.x, OWNER_SIZE.z) + 0.2;
  const rows: {
    local: [number, number, number];
    normal: [number, number, number];
    bearing: number;
    /** Degrees the hit normal is off horizontal. A wall is near 0. */
    tilt: number;
  }[] = [];
  const bearings = 16;
  for (let ring = 0; ring < rings; ring++)
    for (let step = 0; step < bearings; step++) {
      const y = OWNER_BOX.min.y + (OWNER_SIZE.y * (rings - ring - 0.5)) / rings;
      const angle = (step / bearings) * Math.PI * 2;
      SIDE_DIRECTION.set(-Math.sin(angle), 0, -Math.cos(angle));
      SIDE_ORIGIN.set(
        OWNER_CENTER.x + Math.sin(angle) * reach,
        y,
        OWNER_CENTER.z + Math.cos(angle) * reach,
      );
      PROBE_RAY.set(SIDE_ORIGIN, SIDE_DIRECTION);
      PROBE_HITS.length = 0;
      PROBE_RAY.intersectObjects(PROBE_MESHES, false, PROBE_HITS);
      const hit = PROBE_HITS.find((candidate) => candidate.face);
      if (!hit?.face) continue;
      PROBE_NORMAL_MATRIX.getNormalMatrix(hit.object.matrixWorld);
      PROBE_NORMAL.copy(hit.face.normal)
        .applyMatrix3(PROBE_NORMAL_MATRIX)
        .normalize();
      // Face the way the ray came from — a back-face hit reports the inside.
      if (PROBE_NORMAL.dot(SIDE_DIRECTION) > 0) PROBE_NORMAL.multiplyScalar(-1);
      insectFlightVolumeLocal(frame, hit.point, OWNER_LOCAL);
      rows.push({
        local: [
          Number(OWNER_LOCAL.x.toFixed(4)),
          Number(OWNER_LOCAL.y.toFixed(4)),
          Number(OWNER_LOCAL.z.toFixed(4)),
        ],
        normal: [
          Number(PROBE_NORMAL.x.toFixed(4)),
          Number(PROBE_NORMAL.y.toFixed(4)),
          Number(PROBE_NORMAL.z.toFixed(4)),
        ],
        bearing: Number(((angle * 180) / Math.PI).toFixed(1)),
        tilt: Number(
          ((Math.asin(Math.abs(PROBE_NORMAL.y)) * 180) / Math.PI).toFixed(1),
        ),
      });
    }
  return rows;
}

function sceneInteractionOwnerSites(unitIndex: number) {
  const frame = OWNER_FRAMES[unitIndex];
  return sceneInteractionInventory()
    .filter((spec) => spec.activeUnits.includes(unitIndex))
    .map((spec) => {
      spec.root.updateWorldMatrix(true, true);
      OWNER_BOX.setFromObject(spec.root, true);
      if (OWNER_BOX.isEmpty() || !frame)
        return { id: spec.id, empty: true, top: null, size: null };
      OWNER_BOX.getSize(OWNER_SIZE);
      OWNER_BOX.getCenter(OWNER_CENTER);
      insectFlightVolumeLocal(
        frame,
        { x: OWNER_CENTER.x, y: OWNER_BOX.max.y, z: OWNER_CENTER.z },
        OWNER_LOCAL,
      );
      return {
        id: spec.id,
        empty: false,
        top: [
          Number(OWNER_LOCAL.x.toFixed(4)),
          Number(OWNER_LOCAL.y.toFixed(4)),
          Number(OWNER_LOCAL.z.toFixed(4)),
        ],
        size: [
          Number(OWNER_SIZE.x.toFixed(4)),
          Number(OWNER_SIZE.y.toFixed(4)),
          Number(OWNER_SIZE.z.toFixed(4)),
        ],
      };
    });
}

const FLIGHT_VOLUMES = Array.from({ length: UNIT_COUNT }, (_, unitIndex) => ({
  unitIndex,
  corners: flightVolumeOutline(createInsectFlightVolume(unitPose(unitIndex))),
}));
const DISPOSITION_COLOR = {
  ready: "#55d98b",
  waiting: "#f0bd4f",
  // Occupied is the only one of these that means the system WORKED, so it does
  // not share amber with "reserved, insect still inbound". Blue rather than a
  // second green: ready and occupied are the two states most often compared at
  // a glance, and two greens would be the hardest possible pair to tell apart.
  occupied: "#5aa9ff",
  rejected: "#ff5964",
} as const;

/** Moth-eligible Perches get a fixed colour, not the disposition colour.
 *
 * Species is a property of the SITE and never changes; health changes every
 * frame. Painting the species ring in the health colour meant the one thing it
 * was added to communicate — where a moth is allowed to land — disappeared into
 * whatever the Perch happened to be doing. */
const MOTH_RING_COLOR = "#c79bff";

const CONE_SEGMENTS = 24;

/**
 * A Lamp Cone as one polyline: the near ring, the far ring, and four rules
 * joining them.
 *
 * One `Line` rather than six keeps this to a single draw call per lamp, which
 * matters because the overlay redraws whenever a lamp moves — and a desk lamp
 * is a prop that can be picked up.
 */
function lampConeOutlinePoints(cone: InsectLampConeOutline) {
  const { source, direction } = cone;
  // Any pair of axes perpendicular to the beam; the cone is circular, so their
  // roll is arbitrary.
  const up =
    Math.abs(direction.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const ax = direction.y * up.z - direction.z * up.y;
  const ay = direction.z * up.x - direction.x * up.z;
  const az = direction.x * up.y - direction.y * up.x;
  const aLength = Math.hypot(ax, ay, az) || 1;
  const ux = ax / aLength;
  const uy = ay / aLength;
  const uz = az / aLength;
  const vx = direction.y * uz - direction.z * uy;
  const vy = direction.z * ux - direction.x * uz;
  const vz = direction.x * uy - direction.y * ux;
  const ring = (distance: number, radius: number, step: number) => {
    const angle = (step / CONE_SEGMENTS) * Math.PI * 2;
    const cos = Math.cos(angle) * radius;
    const sin = Math.sin(angle) * radius;
    return [
      source.x + direction.x * distance + ux * cos + vx * sin,
      source.y + direction.y * distance + uy * cos + vy * sin,
      source.z + direction.z * distance + uz * cos + vz * sin,
    ] as [number, number, number];
  };
  const points: [number, number, number][] = [];
  for (let step = 0; step <= CONE_SEGMENTS; step++)
    points.push(ring(cone.nearDistance, cone.nearRadius, step));
  for (let step = 0; step <= CONE_SEGMENTS; step++)
    points.push(ring(cone.farDistance, cone.farRadius, step));
  // Four rules, drawn as a there-and-back so the single polyline never leaves a
  // stray chord across the cone.
  for (const step of [
    0,
    CONE_SEGMENTS / 4,
    CONE_SEGMENTS / 2,
    (CONE_SEGMENTS * 3) / 4,
  ]) {
    points.push(ring(cone.nearDistance, cone.nearRadius, step));
    points.push(ring(cone.farDistance, cone.farRadius, step));
    points.push(ring(cone.nearDistance, cone.nearRadius, step));
  }
  return points;
}

/** Keep review helpers visually distinct from the wildlife they measure. A
 * previous 2.5–3.2 cm sphere plus the full wire envelope made a rejected site
 * look like a motionless red insect from the shelf camera. These deliberately
 * geometric markers are smaller than the rendered animal and hidden by
 * default. */
export const INSECT_PERCH_GLYPH_STYLE = {
  authored: { shape: "diamond", size: 0.009 },
  contact: { shape: "box", size: 0.012 },
  envelope: { defaultVisible: false, opacity: 0.12 },
  /**
   * A ring drawn around the Perches a MOTH may use.
   *
   * Every glyph looked identical and was coloured only by disposition, so the
   * HUD could say a Perch was ready but never which species it was ready for —
   * owner review: "it's also hard to tell which places moths can land". Moths
   * are eligible only for Lamp Perches (`eligibleSpecies` in
   * `insectFlightWorld.ts`), which is four sites in the whole room, and there
   * was nothing on screen that said so.
   */
  mothEligible: { radius: 0.026, thickness: 0.0022 },
} as const;

/** Moths may only use Lamp Perches. Butterflies may use every Perch. */
export function insectPerchIsMothEligible(
  diagnostic: Pick<InsectPerchDiagnostic, "eligibleSpecies">,
) {
  return diagnostic.eligibleSpecies.includes("moth");
}

export function insectPerchGlyphIsVisible(
  snapshot: Pick<
    InsectDiagnosticsSnapshot,
    "hoveredPerchId" | "showEnvelopes" | "showRoutes"
  >,
  perchId: string,
) {
  return (
    snapshot.showEnvelopes ||
    snapshot.showRoutes ||
    snapshot.hoveredPerchId === perchId
  );
}

const RING_UP = new THREE.Vector3(0, 0, 1);
const RING_NORMAL = new THREE.Vector3();
const RING_QUATERNION = new THREE.Quaternion();

/** Lay the moth ring flat on the surface: a torus is authored in the XY plane,
 * so its own +Z has to be turned onto the contact normal. */
function mothRingQuaternion(normal: CollisionPoint) {
  RING_NORMAL.set(normal.x, normal.y, normal.z).normalize();
  return RING_QUATERNION.setFromUnitVectors(RING_UP, RING_NORMAL).clone();
}

function PerchGlyph({
  diagnostic,
  showEnvelope,
  showRoutes,
}: {
  diagnostic: ReturnType<typeof diagnoseInsectPerch>;
  showEnvelope: boolean;
  showRoutes: boolean;
}) {
  const authored = diagnostic.authoredAnchor;
  const contact = diagnostic.resolvedContact;
  const normal = diagnostic.normal;
  const color = DISPOSITION_COLOR[diagnostic.disposition];
  return (
    <group name={`perch-diagnostic:${diagnostic.perchId}`}>
      {/* The authored anchor is coloured by the same disposition as everything
        else on the glyph. It used to be hardcoded red and drawn through
        geometry, which put a red marker on every valid Perch and made the HUD
        read as a wall of rejections that was never there. */}
      <mesh
        position={[authored.x, authored.y, authored.z]}
        raycast={NO_RAYCAST}
      >
        <octahedronGeometry
          args={[INSECT_PERCH_GLYPH_STYLE.authored.size, 0]}
        />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* A halo around the four Lamp Perches, laid into the surface so it reads
        as belonging to the site. Species is a property of the Perch, not of its
        health, so it gets its own channel — shape — and leaves colour to say
        only what it already says. */}
      {insectPerchIsMothEligible(diagnostic) && contact && normal ? (
        <mesh
          position={[contact.x, contact.y, contact.z]}
          quaternion={mothRingQuaternion(normal)}
          raycast={NO_RAYCAST}
        >
          <torusGeometry
            args={[
              INSECT_PERCH_GLYPH_STYLE.mothEligible.radius,
              INSECT_PERCH_GLYPH_STYLE.mothEligible.thickness,
              6,
              28,
            ]}
          />
          <meshBasicMaterial color={MOTH_RING_COLOR} depthTest={false} />
        </mesh>
      ) : null}
      {contact ? (
        <>
          <mesh
            position={[contact.x, contact.y, contact.z]}
            raycast={NO_RAYCAST}
          >
            <boxGeometry
              args={[
                INSECT_PERCH_GLYPH_STYLE.contact.size,
                INSECT_PERCH_GLYPH_STYLE.contact.size,
                INSECT_PERCH_GLYPH_STYLE.contact.size,
              ]}
            />
            <meshBasicMaterial color={color} depthTest={false} />
          </mesh>
          <Line
            points={[
              [authored.x, authored.y, authored.z],
              [contact.x, contact.y, contact.z],
            ]}
            color={color}
            lineWidth={1}
            depthTest={false}
            raycast={NO_RAYCAST}
          />
          {normal ? (
            <Line
              points={[
                [contact.x, contact.y, contact.z],
                [
                  contact.x + normal.x * 0.08,
                  contact.y + normal.y * 0.08,
                  contact.z + normal.z * 0.08,
                ],
              ]}
              color="#7ddcff"
              lineWidth={2}
              depthTest={false}
              raycast={NO_RAYCAST}
            />
          ) : null}
          {showEnvelope ? (
            <mesh
              position={[contact.x, contact.y, contact.z]}
              raycast={NO_RAYCAST}
            >
              <sphereGeometry
                args={[diagnostic.envelope.sweepRadius, 16, 10]}
              />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={INSECT_PERCH_GLYPH_STYLE.envelope.opacity}
                wireframe
                depthTest={false}
              />
            </mesh>
          ) : null}
        </>
      ) : null}
      {showRoutes
        ? // `displayRoutes`, not `routes`: the verdict copy is dropped the
          // instant a prop sways and the collision revision moves, so drawing
          // from it made every path blink in and out. See `routesForDisplay`.
          diagnostic.displayRoutes
            .filter((route) => route.points.length >= 2)
            .map((route) => (
              <Line
                key={route.phase}
                points={route.points.map(
                  (point) => [point.x, point.y, point.z] as const,
                )}
                color={route.clear ? "#66e3a1" : "#ff5964"}
                lineWidth={1}
                depthTest={false}
                raycast={NO_RAYCAST}
              />
            ))
        : null}
    </group>
  );
}

/** Development-only scene overlay. It is mounted beside SceneContent, never
 * below a collision-indexed Unit root, and every helper opts out of raycasts. */
export default function InsectPerchDiagnostics() {
  const snapshot = useSyncExternalStore(
    insectDiagnosticsController.subscribe,
    insectDiagnosticsController.getSnapshot,
    insectDiagnosticsController.getSnapshot,
  );
  const activeUnit = useStacks((state) => state.activeUnit);
  const lastTick = useRef(-1);
  // Preview routes are the expensive part of this overlay — a landing plan is a
  // search over more than a hundred candidate curves — so they are recompiled
  // at 1 Hz and held in between, rather than at the 4 Hz diagnostics cadence.
  const previewRoutes = useRef(
    new Map<string, readonly InsectDiagnosticRoute[]>(),
  );
  useFrame(({ clock }) => {
    const tick = Math.floor(clock.elapsedTime * 4);
    if (lastTick.current === tick) return;
    lastTick.current = tick;
    // This frame is about to cost far more than any frame production pays
    // for. Tell the quality sampler to throw it away rather than adapt to it.
    markSceneFrameInstrumented();
    const filter = insectDiagnosticsController.getSnapshot().filter;
    // Evaluate every Perch, then filter for the HUD. The bridge below needs
    // the whole catalogue: `pnpm check:perches` walks the room Unit by Unit
    // and would otherwise only ever see the shelf the HUD happens to be
    // showing.
    const all = [...getInsectPerches().values()].map((perch) =>
      diagnoseInsectPerch(
        perch.id,
        perch.kind === "lamp" ? "moth" : "butterfly",
        clock.elapsedTime,
        false,
      ),
    );
    const visible =
      filter === "all"
        ? all
        : all.filter((diagnostic) => diagnostic.unitIndex === activeUnit);
    // Route geometry from a real landing is truth about an attempt an insect
    // made, and it is what the overlay draws when it exists. It usually does
    // not: a Perch only ever has one for a few seconds after somebody tried it.
    // The preview fills every other Perch in, so the toggle answers "can
    // anything get in and out of here" for the whole shelf at once.
    const routes = insectDiagnosticsController.getSnapshot().showRoutes;
    if (!routes) previewRoutes.current.clear();
    else if (tick % 4 === 0)
      for (const diagnostic of visible)
        previewRoutes.current.set(
          diagnostic.perchId,
          previewInsectPerchRoutes(
            diagnostic.perchId,
            diagnostic.species,
            clock.elapsedTime,
          ),
        );
    const diagnostics = routes
      ? visible.map((diagnostic) =>
          diagnostic.displayRoutes.length > 0
            ? diagnostic
            : {
                ...diagnostic,
                displayRoutes:
                  previewRoutes.current.get(diagnostic.perchId) ?? [],
              },
        )
      : visible;
    insectDiagnosticsController.update({ diagnostics });
    // Development-only bridge for offline review and for the live check (ADR
    // 0006). The HUD shows a Perch's rejection code but not its geometry, and
    // "the marker is on the hull, not the sail" is a question about
    // coordinates. Publishing the same evaluated snapshot the HUD renders lets
    // an audit read resolved contacts and normals — and lets a script hold the
    // scene to invariants vitest structurally cannot see — without anyone
    // having to patch instrumentation into the tree.
    if (process.env.NODE_ENV === "development")
      (window as unknown as Record<string, unknown>).__stacksInsects = {
        time: clock.elapsedTime,
        activeUnit,
        diagnostics: all,
        flights: insectDiagnosticsController.getSnapshot().flightStates,
        lampCones: insectDiagnosticsController.getSnapshot().lampCones,
        residency: insectDiagnosticsController.getSnapshot().residency,
        // Authoring aid, not telemetry: which props are actually mounted on a
        // shelf right now, and where each one sits in its Unit's own frame.
        // Called on demand rather than published, because a Box3 per
        // interaction every quarter second would be real work in exchange for
        // something only a person authoring a Perch ever reads.
        //
        // The bounds are for CHOOSING a candidate anchor. They are never the
        // authored contact: the anchor is advisory, the resolver raycasts the
        // owner's real triangles, and the resolved contact is what gets copied
        // back. The sailboat mast shares one mesh with the hull, so its box top
        // is 13 cm above any surface a probe can hit.
        owners: (unit: number) =>
          sceneInteractionOwnerSites(unit).map((site) => ({
            ...site,
            unitIndex: unit,
          })),
        // Resolved contacts are published in world space; the catalogue is
        // authored in a Unit's own frame. Copying one back meant doing this
        // conversion by hand, which is exactly the step where a Perch quietly
        // acquires a wrong number.
        // The topmost real triangle over a grid on one prop. See
        // `probeInteractionSurface` — this is what replaces guessing an offset
        // from a bounding box and re-running the page to find out.
        probe: (unit: number, ownerId: string, steps?: number) =>
          probeInteractionSurface(unit, ownerId, steps),
        // The same job for a wall rather than a lid. See
        // `probeInteractionFlank` — a downward probe cannot see the side of a
        // lamp shade at all, which is why every lamp Perch was on the top.
        probeSide: (unit: number, ownerId: string, rings?: number) =>
          probeInteractionFlank(unit, ownerId, rings),
        // Turn a `restingPoseBlockedBy` box id into something nameable.
        describeBox: (unit: number, boxId: string) =>
          describeInsectCollisionBox(unit, boxId),
        toUnitLocal: (unit: number, point: CollisionPoint | null) => {
          const frame = OWNER_FRAMES[unit];
          if (!frame || !point) return null;
          insectFlightVolumeLocal(frame, point, OWNER_LOCAL);
          return { x: OWNER_LOCAL.x, y: OWNER_LOCAL.y, z: OWNER_LOCAL.z };
        },
      };
  });

  if (!insectDiagnosticsEnabled(process.env.NODE_ENV)) return null;
  const visibleDiagnostics = snapshot.diagnostics.filter((diagnostic) =>
    insectPerchGlyphIsVisible(snapshot, diagnostic.perchId),
  );
  return (
    <group name="insect-perch-diagnostics">
      {snapshot.showFlightVolumes
        ? FLIGHT_VOLUMES.map(({ unitIndex, corners }) =>
            snapshot.filter === "all" || unitIndex === activeUnit ? (
              <Line
                key={`flight-volume:${unitIndex}`}
                name={`flight-volume:${unitIndex}`}
                points={corners}
                color="#50c8ff"
                transparent
                opacity={0.32}
                lineWidth={1}
                depthTest={false}
                raycast={NO_RAYCAST}
              />
            ) : null,
          )
        : null}
      {/* The moths' containment. Butterflies had their Flight Volumes drawn and
        moths had nothing on screen at all, so there was no way to see where a
        moth was allowed to be. Its own switch, because the two species are
        never on screen together and one toggle meant always drawing the half
        you were not looking at. */}
      {snapshot.showLampCones
        ? snapshot.lampCones.map((cone) => (
            <Line
              key={`lamp-cone:${cone.lampId}`}
              name={`lamp-cone:${cone.lampId}`}
              points={lampConeOutlinePoints(cone)}
              color={MOTH_RING_COLOR}
              transparent
              opacity={cone.lit ? 0.42 : 0.16}
              lineWidth={1}
              depthTest={false}
              raycast={NO_RAYCAST}
            />
          ))
        : null}
      {snapshot.flightStates
        .filter(({ telemetry }) => {
          // Per species, because the two switches are independent.
          const species = telemetry.species ?? "butterfly";
          if (
            !(species === "moth"
              ? snapshot.showMothTrails
              : snapshot.showFlightTrails)
          )
            return false;
          return (
            snapshot.filter === "all" || telemetry.unitIndex === activeUnit
          );
        })
        .map(({ telemetry, trail }) =>
          trail.length >= 2 ? (
            <Line
              key={`trail:${telemetry.occupantId}`}
              points={trail.map(
                (point) => [point.x, point.y, point.z] as const,
              )}
              color={
                (telemetry.species ?? "butterfly") === "moth"
                  ? MOTH_RING_COLOR
                  : TRAIL_COLORS[telemetry.residentIndex % 3]
              }
              transparent
              opacity={0.75}
              lineWidth={1}
              depthTest={false}
              raycast={NO_RAYCAST}
            />
          ) : null,
        )}
      {visibleDiagnostics.map((diagnostic) => (
        <PerchGlyph
          key={`${diagnostic.species}:${diagnostic.perchId}`}
          diagnostic={diagnostic}
          showEnvelope={snapshot.showEnvelopes}
          showRoutes={snapshot.showRoutes}
        />
      ))}
    </group>
  );
}
