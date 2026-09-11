"use client";

import React, { useEffect, useState } from "react";
import * as THREE from "three";

import { ABOUT_BOOT_LANDMARKS } from "./aboutBootComposition";
import {
  ABOUT_AIC_SCALE,
  ABOUT_LAMP_SHADE_PERCH,
} from "./aboutCoordinationLayout";
import { ABOUT_LOWER_LANDMARK_Z } from "./aboutScenePose";
import { createInsectLampCone, lampConeContainsPoint } from "./insectLampCone";
import type { InsectPerchRejectionCode } from "./insectPerchDiagnostic";
import {
  getSceneInteraction,
  sceneInteractionInventory,
  sceneInteractionRoots,
} from "./interactionRegistry";
import { type MeadowLamp, getMeadowLamps } from "./meadowLights";
import {
  MUSINGS_LOWER_LAYOUT,
  MUSINGS_TRUST_COVER_PERCH,
} from "./musingsShelfGeometry";
import { deskFrameHeight } from "./photoGeometry";
import { nearPropApproach } from "./propApproachState";
import { SHELF_GEOMETRY, SHELF_SURFACE } from "./shelfGeometry";
import {
  ABOUT_READING_BOOK,
  readingStackPoses,
} from "./units/aboutReadingStack";
import {
  MUSINGS_HEADPHONE_PERCH_POSITION,
  MUSINGS_LAMP_SHADE_PERCH,
  MUSINGS_OPEN_BOOK_PERCH_POSITION,
  MUSINGS_TEA_HANDLE_POSITION,
} from "./units/musingsShelfLighting";
import {
  PROJECT_APPLE_PHOTO_POSE,
  PROJECT_PHOTO_DIMENSIONS,
  REVIEWED_SHELF_LAYOUT,
} from "./units/unitShelfLayout";

export type InsectPerch = {
  id: string;
  unitIndex: number;
  kind: "perch" | "lamp";
  ownerId: string | null;
  ownerPrefix: string | null;
  lampId: string | null;
  clearance: number;
  tangent: readonly [number, number, number] | null;
  contactDistanceTolerance: number | null;
  normalTolerance: number;
  anchor: THREE.Object3D;
  normal: readonly [number, number, number];
  resolvedRoot: THREE.Object3D | null;
  resolvedSurface: THREE.Mesh | null;
  resolvedOwnerId: string | null;
  localPosition: THREE.Vector3;
  localNormal: THREE.Vector3;
};

const perches = new Map<string, InsectPerch>();
const lampPerches = new Map<string, InsectPerch>();
const occupants = new Map<string, string>();

/** Register a live authored Perch. Keeping registration behind this small
 * seam lets the runtime lifecycle and deterministic pilot tests exercise the
 * same registry ownership rules. */
export function registerInsectPerch(perch: InsectPerch) {
  perches.set(perch.id, perch);
  if (perch.lampId) lampPerches.set(perch.lampId, perch);
  return () => {
    if (perches.get(perch.id) !== perch) return;
    perches.delete(perch.id);
    if (perch.lampId && lampPerches.get(perch.lampId) === perch)
      lampPerches.delete(perch.lampId);
    occupants.delete(perch.id);
  };
}

export function getInsectPerches(): ReadonlyMap<string, InsectPerch> {
  return perches;
}

export function getInsectPerch(id: string | null): InsectPerch | null {
  return id ? (perches.get(id) ?? null) : null;
}

export function getLampInsectPerch(lampId: string): InsectPerch | null {
  return lampPerches.get(lampId) ?? null;
}

export function claimInsectPerch(id: string, occupant: string): boolean {
  const current = occupants.get(id);
  if (current && current !== occupant) return false;
  const perch = perches.get(id);
  if (!perch || !resolveInsectPerch(perch).ok) return false;
  occupants.set(id, occupant);
  return true;
}

export function releaseInsectPerch(id: string | null, occupant: string) {
  if (id && occupants.get(id) === occupant) occupants.delete(id);
}

export function insectPerchOccupant(id: string): string | null {
  return occupants.get(id) ?? null;
}

export function insectPerchOwnerId(perch: InsectPerch): string | null {
  return perch.resolvedOwnerId ?? perch.ownerId;
}

export function readInsectPerchWorld(
  perch: InsectPerch,
  position: THREE.Vector3,
  normal: THREE.Vector3,
  quaternion: THREE.Quaternion,
) {
  const root = perch.resolvedRoot;
  const surface = perch.resolvedSurface;
  if (!root?.parent || !surface?.parent) {
    perch.resolvedRoot = null;
    perch.resolvedSurface = null;
    perch.resolvedOwnerId = null;
    return false;
  }
  surface.updateWorldMatrix(true, false);
  position.copy(perch.localPosition).applyMatrix4(surface.matrixWorld);
  CONTACT_NORMAL_MATRIX.getNormalMatrix(surface.matrixWorld);
  normal
    .copy(perch.localNormal)
    .applyMatrix3(CONTACT_NORMAL_MATRIX)
    .normalize();
  surface.getWorldQuaternion(quaternion);
  return true;
}

export function lampPerchIsLit(perch: InsectPerch): boolean {
  if (perch.kind !== "lamp" || !perch.lampId) return false;
  return (getMeadowLamps().get(perch.lampId)?.litRef.current ?? 0) > 0.45;
}

const MOTH_NEAR_POSITION = new THREE.Vector3();
const MOTH_NEAR_NORMAL = new THREE.Vector3();
const MOTH_NEAR_QUATERNION = new THREE.Quaternion();

/**
 * Whether a moth may use this Perch at all — a property of the SITE, so it does
 * not vary with whether the lamp happens to be on. The lit gate stays separate
 * (`lit` in `diagnoseInsectPerch`), which also keeps the review HUD's species
 * ring from blinking every time a lamp is switched.
 *
 * Moths were once eligible for Lamp Perches and nothing else, and there is
 * exactly ONE Lamp Perch per lamp — four in the room, two of them mis-authored
 * and a third under a shelf plank. Nobody had ever seen a moth land. Any site
 * inside a lamp's own pool counts now, which is the ordinary sight anyway:
 * moths gather at the light, not on the fixture.
 */
export function insectPerchAcceptsMoth(perch: InsectPerch): boolean {
  if (perch.kind === "lamp") return true;
  if (
    !readInsectPerchWorld(
      perch,
      MOTH_NEAR_POSITION,
      MOTH_NEAR_NORMAL,
      MOTH_NEAR_QUATERNION,
    )
  )
    return false;
  return lampLightingPerch(MOTH_NEAR_POSITION) !== null;
}

const MOTH_PERCH_CONE = createInsectLampCone();

/**
 * The lamp whose cone contains this point, or null.
 *
 * This asks the moths' own containment rather than a radius around the bulb.
 * A sphere and a cone disagree in both directions — it admitted sites behind
 * the shade where no light falls, and refused sites a metre down the beam that
 * are the brightest places in the room — and the moths were being sent to the
 * first kind while being physically confined to the second.
 */
function lampLightingPerch(point: THREE.Vector3): MeadowLamp | null {
  for (const lamp of getMeadowLamps().values()) {
    const dx = lamp.coneTargetX - lamp.sourceX;
    const dy = lamp.coneTargetY - lamp.sourceY;
    const dz = lamp.coneTargetZ - lamp.sourceZ;
    const length = Math.hypot(dx, dy, dz) || 1;
    MOTH_PERCH_CONE.sourceX = lamp.sourceX;
    MOTH_PERCH_CONE.sourceY = lamp.sourceY;
    MOTH_PERCH_CONE.sourceZ = lamp.sourceZ;
    MOTH_PERCH_CONE.dirX = dx / length;
    MOTH_PERCH_CONE.dirY = dy / length;
    MOTH_PERCH_CONE.dirZ = dz / length;
    MOTH_PERCH_CONE.nearDistance = lamp.mothNearDistance;
    MOTH_PERCH_CONE.farDistance = lamp.mothFarDistance;
    MOTH_PERCH_CONE.maxRadius = lamp.mothMaxRadius;
    if (lampConeContainsPoint(MOTH_PERCH_CONE, point)) return lamp;
  }
  return null;
}

/** Whether the lamp lighting this Perch is currently on. For a Lamp Perch that
 * is its own fixture; for an ordinary Perch it is the nearest lamp within
 * range. */
export function insectPerchMothLightIsOn(perch: InsectPerch): boolean {
  if (perch.kind === "lamp") return lampPerchIsLit(perch);
  if (
    !readInsectPerchWorld(
      perch,
      MOTH_NEAR_POSITION,
      MOTH_NEAR_NORMAL,
      MOTH_NEAR_QUATERNION,
    )
  )
    return false;
  const lamp = lampLightingPerch(MOTH_NEAR_POSITION);
  return Boolean(lamp && lamp.litRef.current > 0.45);
}

function PerchAnchor({
  id,
  unitIndex,
  position,
  normal = [0, 1, 0],
  ownerId = null,
  ownerPrefix = null,
  lampId = null,
  clearance = 0.12,
  tangent = null,
  contactDistanceTolerance = null,
  normalTolerance = 0.3,
}: {
  id: string;
  unitIndex: number;
  position: readonly [number, number, number];
  normal?: readonly [number, number, number];
  ownerId?: string | null;
  ownerPrefix?: string | null;
  lampId?: string | null;
  clearance?: number;
  tangent?: readonly [number, number, number] | null;
  contactDistanceTolerance?: number | null;
  normalTolerance?: number;
}) {
  // A state ref, not a `useRef`. Registration depends on the anchor being
  // ATTACHED, and a passive effect that reads `ref.current` is only correct if
  // the commit that attached it has already run — when it has not, the effect
  // returns early, nothing re-runs it, and the Perch is silently absent from
  // the registry for the life of the page while everything else about it looks
  // fine. Making the object part of the dependency list means attachment is
  // what schedules registration, in either order.
  const [anchor, setAnchor] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const perch: InsectPerch = {
      id,
      unitIndex,
      kind: lampId ? "lamp" : "perch",
      ownerId,
      ownerPrefix,
      lampId,
      clearance,
      tangent,
      contactDistanceTolerance,
      normalTolerance,
      anchor,
      normal,
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(0, 1, 0),
    };
    return registerInsectPerch(perch);
  }, [
    anchor,
    clearance,
    contactDistanceTolerance,
    id,
    lampId,
    normal,
    normalTolerance,
    ownerId,
    ownerPrefix,
    tangent,
    unitIndex,
  ]);
  return <object3D ref={setAnchor} position={position} visible={false} />;
}

export type PerchDefinition = {
  id: string;
  position: readonly [number, number, number];
  ownerId?: string;
  ownerPrefix?: string;
  lampId?: string;
  normal?: readonly [number, number, number];
  clearance?: number;
  tangent?: readonly [number, number, number];
  contactDistanceTolerance?: number;
  normalTolerance?: number;
};

export type InsectPerchContactResult =
  | Readonly<{
      ok: true;
      ownerId: string;
      surface: THREE.Mesh;
      authoredPosition: THREE.Vector3;
      position: THREE.Vector3;
      normal: THREE.Vector3;
      anchorDistance: number;
      normalAgreement: number;
    }>
  | Readonly<{
      ok: false;
      rejectionCode: Extract<
        InsectPerchRejectionCode,
        | "owner-not-found"
        | "owner-empty"
        | "no-triangle-surface"
        | "no-visible-contact"
        | "contact-too-distant"
        | "contact-normal-mismatch"
      >;
    }>;

const CONTACT_BOX = new THREE.Box3();
const CONTACT_RAY = new THREE.Raycaster();
const CONTACT_ORIGIN = new THREE.Vector3();
const CONTACT_DIRECTION = new THREE.Vector3(0, -1, 0);
const CONTACT_WORLD_NORMAL = new THREE.Vector3();
const CONTACT_AUTHORED_POSITION = new THREE.Vector3();
const CONTACT_AUTHORED_NORMAL = new THREE.Vector3();
const CONTACT_AUTHORED_QUATERNION = new THREE.Quaternion();
const CONTACT_CANDIDATE_NORMAL = new THREE.Vector3();
const CONTACT_NORMAL_MATRIX = new THREE.Matrix3();
const CONTACT_HITS: THREE.Intersection[] = [];
const CONTACT_SURFACES: THREE.Object3D[] = [];
const CONTACT_PART_BOX = new THREE.Box3();
const CONTACT_SEEN = new Set<THREE.Object3D>();
const CONTACT_PROBES = [0.14, 0.32, 0.5, 0.68, 0.86] as const;
const CACHED_POSITION = new THREE.Vector3();
const CACHED_NORMAL = new THREE.Vector3();
const CACHED_QUATERNION = new THREE.Quaternion();
const CACHED_AUTHORED_POSITION = new THREE.Vector3();
const CACHED_AUTHORED_NORMAL = new THREE.Vector3();

function isVisibleContact(hit: THREE.Intersection) {
  if (!(hit.object instanceof THREE.Mesh) || !hit.face) return false;
  for (
    let object: THREE.Object3D | null = hit.object;
    object;
    object = object.parent
  ) {
    if (!object.visible) return false;
  }
  const mesh = hit.object as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.Material | THREE.Material[]
  >;
  const materials: THREE.Material[] = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials.some(
    (material) =>
      material.visible &&
      material.colorWrite &&
      (!material.transparent || material.opacity > 0.05),
  );
}

const NEAR_NODE_MATRIX = new THREE.Matrix4();
const NEAR_REST_MATRIX = new THREE.Matrix4();
const NEAR_PARENT_MATRIX = new THREE.Matrix4();
const NEAR_PARENT_INVERSE = new THREE.Matrix4();
const NEAR_DELTA = new THREE.Matrix4();
const NEAR_DELTA_NORMALS = new THREE.Matrix3();
const NEAR_REST_QUATERNION = new THREE.Quaternion();
const NEAR_UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const NEAR_ORIGIN = new THREE.Vector3();

/**
 * Carry a Perch's authored anchor and normal along with a prop that is up at
 * the camera (PropApproach). The anchor is authored in the shelf frame, and
 * the approach moves the prop's visible children, not its carrier, so with
 * the prop four units away the anchor was left over an empty shelf spot.
 * Candidates are ranked by distance to the anchor, which from that far
 * favoured whichever face of the prop was nearest the shelf: the tile's back,
 * whose normal then failed the tolerance and the Perch reported
 * `contact-normal-mismatch` the whole time the tile was up. Measured with
 * `__stacksInsects.probe` on 2026-09-11.
 *
 * The delta is the approach group's world transform against what it would
 * be at rest (PropApproach leaves its rest quaternion in userData). A prop
 * turned upside down by hand carries its normal with it, so the flipped tile
 * still refuses, which is right.
 */
export function carryWithNearProp(
  ownerId: string,
  roots: readonly THREE.Object3D[],
  position: THREE.Vector3,
  normal: THREE.Vector3,
) {
  if (nearPropApproach()?.id !== ownerId) return;
  const prefix = `prop-approach:${ownerId}:`;
  // An explicit stack rather than `traverse`: TypeScript cannot see an
  // assignment made inside traverse's callback and narrows the result to
  // `never`.
  const stack: THREE.Object3D[] = [...roots];
  let found: THREE.Object3D | null = null;
  while (stack.length && !found) {
    const object = stack.pop()!;
    if (
      object.name.startsWith(prefix) &&
      Array.isArray(object.userData.propApproachRest)
    )
      found = object;
    else stack.push(...object.children);
  }
  if (!found?.parent) return;
  const rest = found.userData.propApproachRest as [
    number,
    number,
    number,
    number,
  ];
  NEAR_REST_QUATERNION.fromArray(rest);
  NEAR_REST_MATRIX.compose(NEAR_ORIGIN, NEAR_REST_QUATERNION, NEAR_UNIT_SCALE);
  found.updateMatrix();
  NEAR_NODE_MATRIX.copy(found.matrix);
  NEAR_PARENT_MATRIX.copy(found.parent.matrixWorld);
  NEAR_PARENT_INVERSE.copy(NEAR_PARENT_MATRIX).invert();
  // world' = parent · node · rest⁻¹ · parent⁻¹ · world
  NEAR_DELTA.copy(NEAR_PARENT_MATRIX)
    .multiply(NEAR_NODE_MATRIX)
    .multiply(NEAR_REST_MATRIX.invert())
    .multiply(NEAR_PARENT_INVERSE);
  position.applyMatrix4(NEAR_DELTA);
  NEAR_DELTA_NORMALS.getNormalMatrix(NEAR_DELTA);
  normal.applyMatrix3(NEAR_DELTA_NORMALS).normalize();
}

function resolveOwner(perch: InsectPerch) {
  if (perch.ownerId) return getSceneInteraction(perch.ownerId);
  const prefix = perch.ownerPrefix;
  if (!prefix) return null;
  return (
    sceneInteractionInventory().find(
      (interaction) =>
        interaction.activeUnits.includes(perch.unitIndex) &&
        interaction.id.startsWith(prefix),
    ) ?? null
  );
}

/** Resolve "top of this prop" against its actual rendered meshes. The probe
 * grid runs only when a site is claimed. The best anchor/normal match is stored
 * in hit-mesh-local space, so nested hover/sway transforms remain exact without
 * repeating raycasts. */
export function resolveInsectPerch(
  perch: InsectPerch,
): InsectPerchContactResult {
  // Hold the previous resolution rather than clearing it up front.
  //
  // A prop's measurable bounds come and go: it is registered twice, rebuilt
  // behind Suspense, and re-created outright on a theme flip, so on a
  // meaningful fraction of frames there is nothing to measure. Measured on the
  // About shelf, `about:globe-crown` reported no bounds on 11% of samples and
  // `about:lamp-shade` on most of them. Clearing first meant every one of those
  // frames threw away a perfectly good contact and reported `owner-empty` — the
  // HUD paints that red, so a working Perch flickered red, and the owner saw
  // exactly that: "the AIC and light are red... the globe becomes red".
  //
  // The cached contact is stored in the hit MESH's local space, so it stays
  // correct while the prop moves, spins or is carried. If the mesh is genuinely
  // gone, `readInsectPerchWorld` fails on its own and clears the cache; that is
  // the check that decides a Perch has really been lost, not a momentarily
  // unmeasurable bounding box.
  const cachedRoot = perch.resolvedRoot;
  const cachedSurface = perch.resolvedSurface;
  const cachedOwnerId = perch.resolvedOwnerId;
  const keepCached = (): InsectPerchContactResult | null => {
    if (!cachedRoot?.parent || !cachedSurface?.parent || !cachedOwnerId)
      return null;
    perch.resolvedRoot = cachedRoot;
    perch.resolvedSurface = cachedSurface;
    perch.resolvedOwnerId = cachedOwnerId;
    // Rebuild the report from the cached mesh-local contact rather than
    // inventing one: the caller is entitled to the same world position, normal
    // and agreement it would have got from a full resolve.
    if (
      !readInsectPerchWorld(
        perch,
        CACHED_POSITION,
        CACHED_NORMAL,
        CACHED_QUATERNION,
      )
    )
      return null;
    perch.anchor.getWorldPosition(CACHED_AUTHORED_POSITION);
    perch.anchor.getWorldQuaternion(CACHED_QUATERNION);
    CACHED_AUTHORED_NORMAL.set(...perch.normal)
      .applyQuaternion(CACHED_QUATERNION)
      .normalize();
    carryWithNearProp(
      cachedOwnerId,
      sceneInteractionRoots(cachedOwnerId),
      CACHED_AUTHORED_POSITION,
      CACHED_AUTHORED_NORMAL,
    );
    return {
      ok: true,
      ownerId: cachedOwnerId,
      surface: cachedSurface,
      authoredPosition: CACHED_AUTHORED_POSITION,
      position: CACHED_POSITION,
      normal: CACHED_NORMAL,
      anchorDistance: CACHED_POSITION.distanceTo(CACHED_AUTHORED_POSITION),
      normalAgreement: CACHED_NORMAL.dot(CACHED_AUTHORED_NORMAL),
    };
  };
  perch.resolvedRoot = null;
  perch.resolvedSurface = null;
  perch.resolvedOwnerId = null;
  const owner = resolveOwner(perch);
  if (!owner)
    return keepCached() ?? { ok: false, rejectionCode: "owner-not-found" };
  // Every root registered under this owner's id, not just the elected carrier.
  // A prop registered by both `Grabbable` and a nested trigger elects the
  // movable part, whose root can be a handle with no geometry beneath it — and
  // a Perch on such a prop then reports `owner-empty` and is never landed on.
  // Measured: the About globe never once resolved, and the Training barbell and
  // kettlebell resolved intermittently. See `sceneInteractionRoots`.
  const roots = sceneInteractionRoots(owner.id);
  const measured = roots.length > 0 ? roots : [owner.root];
  for (const node of measured) node.updateWorldMatrix(true, true);
  perch.anchor.getWorldPosition(CONTACT_AUTHORED_POSITION);
  perch.anchor.getWorldQuaternion(CONTACT_AUTHORED_QUATERNION);
  CONTACT_AUTHORED_NORMAL.set(...perch.normal)
    .applyQuaternion(CONTACT_AUTHORED_QUATERNION)
    .normalize();
  carryWithNearProp(
    owner.id,
    measured,
    CONTACT_AUTHORED_POSITION,
    CONTACT_AUTHORED_NORMAL,
  );
  CONTACT_BOX.makeEmpty();
  for (const node of measured) {
    CONTACT_PART_BOX.setFromObject(node, true);
    if (!CONTACT_PART_BOX.isEmpty()) CONTACT_BOX.union(CONTACT_PART_BOX);
  }
  if (CONTACT_BOX.isEmpty())
    return keepCached() ?? { ok: false, rejectionCode: "owner-empty" };
  // Deduped: the parts are often NESTED — the trigger group sits inside the
  // grab handle — so a plain traverse of both would raycast every mesh twice.
  CONTACT_SURFACES.length = 0;
  CONTACT_SEEN.clear();
  for (const node of measured)
    node.traverse((object) => {
      if (object instanceof THREE.Mesh && !CONTACT_SEEN.has(object)) {
        CONTACT_SEEN.add(object);
        CONTACT_SURFACES.push(object);
      }
    });
  if (CONTACT_SURFACES.length === 0)
    return { ok: false, rejectionCode: "no-triangle-surface" };
  const ownerDiagonal = CONTACT_BOX.getSize(CONTACT_ORIGIN).length();
  const maximumAnchorDistance =
    perch.contactDistanceTolerance ??
    THREE.MathUtils.clamp(ownerDiagonal * 0.45, 0.18, 0.5);
  // Exact owner identity supplies the semantic destination, so without an
  // explicitly authored tolerance the anchor is advisory and merely ranks
  // that owner's normal-matching triangles. Prefix ownership can match a
  // sibling and therefore retains the derived spatial bound.
  const anchorDistanceIsBounded =
    perch.contactDistanceTolerance != null || perch.ownerId == null;
  const selection: {
    best: THREE.Intersection | null;
    score: number;
    anchorDistanceSquared: number;
    normalAgreement: number;
  } = {
    best: null,
    score: Number.POSITIVE_INFINITY,
    anchorDistanceSquared: Number.POSITIVE_INFINITY,
    normalAgreement: -1,
  };
  const considerProbe = (x: number, z: number) => {
    CONTACT_ORIGIN.set(x, CONTACT_BOX.max.y + 0.35, z);
    CONTACT_RAY.set(CONTACT_ORIGIN, CONTACT_DIRECTION);
    CONTACT_HITS.length = 0;
    // Perches resolve only against triangle-bearing mesh surfaces. Recursive
    // owner raycasts also visit decorative Sprites, whose billboard raycast
    // requires a camera and is not a meaningful physical contact anyway.
    CONTACT_RAY.intersectObjects(CONTACT_SURFACES, false, CONTACT_HITS);
    for (const hit of CONTACT_HITS) {
      if (!isVisibleContact(hit)) continue;
      CONTACT_NORMAL_MATRIX.getNormalMatrix(hit.object.matrixWorld);
      CONTACT_CANDIDATE_NORMAL.copy(hit.face!.normal)
        .applyMatrix3(CONTACT_NORMAL_MATRIX)
        .normalize();
      if (CONTACT_CANDIDATE_NORMAL.y < 0) {
        CONTACT_CANDIDATE_NORMAL.multiplyScalar(-1);
      }
      const anchorDistanceSquared = hit.point.distanceToSquared(
        CONTACT_AUTHORED_POSITION,
      );
      const normalAgreement = CONTACT_CANDIDATE_NORMAL.dot(
        CONTACT_AUTHORED_NORMAL,
      );
      const score =
        anchorDistanceSquared + (1 - Math.max(0, normalAgreement)) * 0.12;
      if (!selection.best || score < selection.score) {
        selection.best = hit;
        selection.score = score;
        selection.anchorDistanceSquared = anchorDistanceSquared;
        selection.normalAgreement = normalAgreement;
      }
      break;
    }
  };
  // The authored point is the highest-confidence probe, especially for a
  // large shelf owner whose 5×5 fallback lattice would otherwise quantize a
  // clear ledge contact toward an edge or neighboring prop.
  considerProbe(CONTACT_AUTHORED_POSITION.x, CONTACT_AUTHORED_POSITION.z);
  const authoredContactIsAcceptable = Boolean(
    selection.best &&
      selection.anchorDistanceSquared <=
        maximumAnchorDistance * maximumAnchorDistance &&
      selection.normalAgreement >= perch.normalTolerance,
  );
  if (!authoredContactIsAcceptable) {
    for (const xProbe of CONTACT_PROBES) {
      for (const zProbe of CONTACT_PROBES) {
        considerProbe(
          THREE.MathUtils.lerp(CONTACT_BOX.min.x, CONTACT_BOX.max.x, xProbe),
          THREE.MathUtils.lerp(CONTACT_BOX.min.z, CONTACT_BOX.max.z, zProbe),
        );
      }
    }
  }
  const best = selection.best;
  if (!best?.face) return { ok: false, rejectionCode: "no-visible-contact" };
  if (
    anchorDistanceIsBounded &&
    selection.anchorDistanceSquared >
      maximumAnchorDistance * maximumAnchorDistance
  )
    return { ok: false, rejectionCode: "contact-too-distant" };
  if (selection.normalAgreement < perch.normalTolerance)
    return { ok: false, rejectionCode: "contact-normal-mismatch" };
  perch.resolvedRoot = owner.root;
  perch.resolvedSurface = best.object as THREE.Mesh;
  perch.resolvedOwnerId = owner.id;
  perch.localPosition.copy(best.point);
  best.object.worldToLocal(perch.localPosition);
  CONTACT_NORMAL_MATRIX.getNormalMatrix(best.object.matrixWorld);
  CONTACT_WORLD_NORMAL.copy(best.face.normal)
    .applyMatrix3(CONTACT_NORMAL_MATRIX)
    .normalize();
  if (CONTACT_WORLD_NORMAL.y < 0) CONTACT_WORLD_NORMAL.multiplyScalar(-1);
  CONTACT_NORMAL_MATRIX.setFromMatrix4(best.object.matrixWorld).transpose();
  perch.localNormal
    .copy(CONTACT_WORLD_NORMAL)
    .applyMatrix3(CONTACT_NORMAL_MATRIX)
    .normalize();
  return {
    ok: true,
    ownerId: owner.id,
    surface: best.object as THREE.Mesh,
    authoredPosition: CONTACT_AUTHORED_POSITION.clone(),
    position: best.point.clone(),
    normal: CONTACT_WORLD_NORMAL.clone(),
    anchorDistance: Math.sqrt(selection.anchorDistanceSquared),
    normalAgreement: selection.normalAgreement,
  };
}

/** Four to seven compositionally distinct sites per unit. Coordinates sit
 * clear of the named silhouette and inherit the unit pose. The owner key
 * makes selection fail closed before an interactive prop moves.
 *
 * Every site names a thing a visitor can point at — a medallion rim, a
 * masthead, the crown of an alarm clock — because a butterfly settling on an
 * anonymous ledge reads as a bug in the scene rather than a visitor to it. */
const ABOUT_READING_POSES = readingStackPoses();
const PROJECTS_APPLE_FRAME_PERCH = (() => {
  const frameHeight = deskFrameHeight(PROJECT_PHOTO_DIMENSIONS.apple.height);
  const rotation = new THREE.Euler(...PROJECT_APPLE_PHOTO_POSE.rotation);
  const top = new THREE.Vector3(0, frameHeight / 2, -0.009).applyEuler(
    rotation,
  );
  const normal = new THREE.Vector3(0, 1, 0).applyEuler(rotation);
  const tangent = new THREE.Vector3(1, 0, 0).applyEuler(rotation);
  return {
    position: [
      REVIEWED_SHELF_LAYOUT.projects.topApplePhotoX + top.x,
      SHELF_SURFACE.top + frameHeight / 2 + top.y,
      PROJECT_APPLE_PHOTO_POSE.baseZ + top.z,
    ] as const,
    normal: [normal.x, normal.y, normal.z] as const,
    tangent: [tangent.x, tangent.y, tangent.z] as const,
  };
})();

const UNIT_PERCHES: readonly (readonly PerchDefinition[])[] = [
  [
    {
      id: "about:aic-crown",
      position: [
        ABOUT_BOOT_LANDMARKS["ai-collective"].x + 0.0053 * ABOUT_AIC_SCALE,
        SHELF_SURFACE.lower + 0.208 * ABOUT_AIC_SCALE,
        ABOUT_LOWER_LANDMARK_Z["ai-collective"] + 0.0047 * ABOUT_AIC_SCALE,
      ],
      normal: [0, 1, 0],
      tangent: [0.9928, 0, 0.1197],
      ownerId: "grab:ai-collective-mark",
    },
    {
      id: "about:portrait-frame-top",
      // Top face centre of the frame; re-derived 2026-08-23 when the frame
      // went square (1.02 tall, was 1.24) so the whole portrait shows.
      position: [-0.2211, 0.8288, -0.1049],
      normal: [0, 0.9982, -0.06],
      tangent: [0.9982, -0.0036, -0.0599],
      // `LoosePhoto` in UnitAbout registers `grab:photo:<id>`. The
      // `link:photo:` prefix belongs to `Photo` in photos.tsx, which the About
      // portrait does not use, so this named an owner that has never existed
      // and the Perch was rejected on every frame since it was authored.
      ownerId: "grab:photo:portrait",
    },
    {
      // The POLE of the globe, not its shoulder.
      //
      // A sphere is the most convex support in the room, and the default
      // tolerance of 0.3 accepts any facet within 72° of the authored normal —
      // most of the northern hemisphere. This resolved onto one 22.7° off
      // vertical, and a landing there cannot finish: the Arrival Curve's hover
      // and touchdown slices spiral inward close to the surface, and on a
      // sphere the uphill half of that spiral runs into the globe itself.
      //
      // Measured over a 260 s watch after the preparation-grace fix: three
      // different residents reserved this Perch, it was occupied 38% of the
      // time, and the phase mix was approach:183 hover:15 — reaching hover for
      // the first time and still never touching down.
      //
      // Authoring the normal straight up and demanding close agreement forces
      // the probe onto the crown, where the surface curves away equally on
      // every side and the spiral has somewhere to be. Same fix, same reason,
      // as the two lamp shades below.
      //
      // 0.975 is measured, not chosen: raycasting the real `globe.glb` over a
      // 25×25 grid, the ball is faceted and its flattest triangles sit 10.8°
      // off vertical (dot 0.9822) with the next ring at 13.4° (0.9726). So
      // there is no level facet to ask for — 0.99 admits nothing at all and the
      // Perch rejects outright with `contact-normal-mismatch` — and this
      // threshold takes the crown ring and stops before the shoulder.
      // ...and the anchor was never on the ball. Resolved y was 0.5241, which
      // is model-local 0.4891 against a bounding box whose max is 0.4909: the
      // Perch had been sitting on top of the globe's mounting ARC, a thin
      // curved bar, for its whole existence. That is the bounding-box trap this
      // catalogue warns about, caught this time by the numbers rather than by
      // eye. The ball's own crown is six centimetres lower, at model-local
      // y 0.4306 over the stand at x −1.16, shelf top 0.035, z 0.02.
      // ...and the crown is unreachable anyway, for a reason no amount of
      // re-authoring fixes: the globe's mounting ARC arches directly over it,
      // six centimetres above the ball (model-local 0.4909 against the crown's
      // 0.4306). Every arrival is a spiral onto the contact, and there is a bar
      // across the top of the only place to spiral into.
      //
      // Measured over 150 s, `about:globe-crown` was claimed and then failed
      // `hover-blocked` 84 times, reaching hover and never once touching down —
      // while `about:aic-crown`, a crown of the same kind with open air above
      // it, rested normally throughout. So it is the arc and not the curvature.
      //
      // Owner: "globe landing seems to fail cuz it's moving. should we try to
      // address it or just not have it be a target and add another book
      // instead?" Motion turned out not to be the cause — the ball does turn,
      // but the crown sits on its own spin axis and the resolved contact moved
      // 0.02 mm over twelve seconds — and the second option is the right one
      // regardless. The arc's own top is the only clear surface on the prop and
      // it is a thin curved bar, which is a poor thing to stand a butterfly on.
      //
      // The replacement is the reading stack's middle book, which is the same
      // kind of site as `about:other-minds-top` beside it.
      id: "about:behave-top",
      position: [
        ABOUT_READING_POSES[0].base[0],
        SHELF_SURFACE.lower + ABOUT_READING_BOOK.depth,
        ABOUT_READING_POSES[0].base[2],
      ],
      normal: [0, 1, 0],
      tangent: [0.9682, 0, 0.2503],
      ownerId: "grab:reading:behave",
    },
    {
      id: "about:lamp-shade",
      position: ABOUT_LAMP_SHADE_PERCH.position,
      normal: ABOUT_LAMP_SHADE_PERCH.normal,
      tangent: ABOUT_LAMP_SHADE_PERCH.tangent,
      ownerId: "egg:lamp:0",
      lampId: "desk-lamp-0",
    },
    {
      id: "about:tj-medallion-rim",
      position: [
        ABOUT_BOOT_LANDMARKS["tj-medallion"].x,
        SHELF_SURFACE.lower +
          0.2535 * (ABOUT_BOOT_LANDMARKS["tj-medallion"].sceneScale / 0.72),
        SHELF_GEOMETRY.lower.centerZ,
      ],
      normal: [0, 1, 0],
      tangent: [1, 0, 0],
      ownerId: "grab:tj-medallion:about",
    },
    {
      id: "about:other-minds-top",
      position: [
        ABOUT_READING_POSES[2].base[0],
        SHELF_SURFACE.lower + ABOUT_READING_BOOK.depth,
        ABOUT_READING_POSES[2].base[2],
      ],
      normal: [0, 1, 0],
      tangent: [0.97, 0, 0.243],
      ownerId: "grab:reading:other-minds",
    },
    {
      id: "about:family-frame-top",
      position: [0.4348, 0.3476, 0.0869],
      normal: [0.0245, 0.9961, -0.0848],
      tangent: [0.9997, -0.0244, 0.0021],
      ownerId: "grab:photo:about-family-v8",
    },
  ],
  [
    {
      id: "books:the-12-levers-pages",
      position: [-1.1258, 0.516, 0.2222],
      normal: [0, 1, 0],
      tangent: [0.9996, 0, -0.0266],
      ownerId: "book:the-12-levers",
    },
    {
      id: "books:superminds-pages",
      position: [-0.0502, 0.5127, 0.2013],
      normal: [0, 1, 0],
      tangent: [0.9995, 0, 0.0304],
      ownerId: "book:superminds",
    },
    {
      id: "books:life-3-0-pages",
      position: [0.7133, -0.332, 0.2166],
      normal: [0.1618, 0.9868, 0.0038],
      tangent: [0.9865, -0.1619, 0.0231],
      ownerId: "book:life-3-0",
    },
    {
      id: "books:thinking-fast-and-slow-pages",
      position: [1.0669, -0.3438, 0.2099],
      normal: [0, 1, 0],
      tangent: [0.9989, 0, -0.0463],
      ownerId: "book:thinking-fast-and-slow",
    },
    {
      id: "books:bowling-alone-pages",
      position: [0.6861, 0.4985, 0.2252],
      normal: [0, 1, 0],
      tangent: [0.9984, 0, -0.0571],
      ownerId: "book:bowling-alone",
    },
    {
      id: "books:barking-up-the-wrong-tree-pages",
      position: [-1.0664, -0.352, 0.2205],
      normal: [0, 1, 0],
      tangent: [1, 0, 0.0041],
      ownerId: "book:barking-up-the-wrong-tree",
    },
    {
      id: "books:homo-deus-pages",
      position: [-0.3607, -0.3156, 0.1806],
      normal: [0.0301, 0.9571, -0.2883],
      tangent: [0.9946, 0, 0.1039],
      ownerId: "book:homo-deus",
    },
  ],
  [
    {
      // The BAR, not either plate.
      //
      // Owner review: "looks like it might not work cuz it's out of bounds...
      // we need one for each side and that it's within bounds of each shelf".
      // Surface-probing the prop showed the problem is worse than one bad end —
      // the barbell lies diagonally across the corner, and NEITHER plate is
      // inside the Flight Volume. Measured plate tops:
      //
      //   near plate  [1.3138, -0.6208, -1.6899]   z is 0.29 m behind minZ -1.4
      //   far plate   [2.5262, -0.6208, -0.3901]   x is 0.33 m past  ±2.2
      //
      // The predecessor sat on that far plate, which is why the live check only
      // ever saw it resolve on 18 samples of 45: the handoff band stops the
      // clamp firing, so the catalogue test passed, but containment leans the
      // whole approach back inward the entire way out there.
      //
      // The bar between the plates carries a flat top facet at y -0.8375 with
      // an exactly vertical normal, and the stretch of it from x 1.73 to 2.11
      // is inside the volume on every axis. The midpoint is 0.44 m from either
      // plate, so nothing crowds the resting pose. A butterfly on the bar of a
      // barbell is also simply a better image than one on the rim of a weight.
      id: "training:barbell-bar",
      position: [1.92, -0.8375, -1.04],
      normal: [0, 1, 0],
      tangent: [0.6817, 0, 0.7316],
      ownerId: "grab:barbell",
      contactDistanceTolerance: 0.06,
    },
    {
      // The tub moved up to the top shelf's back row; same lid, translated.
      id: "training:protein-lid",
      position: [0.42, 0.509, -0.2],
      normal: [0, 1, 0],
      tangent: [0.9553, 0, -0.2955],
      ownerId: "grab:protein",
    },
    {
      // The dumbbell came down to the lower shelf and lies across it at an
      // angle; this is the same measured point on the plate, carried through
      // that rigid move (yaw 1.18 to -0.45, base to [0.4, lower, -0.09]; the
      // plank surfaces are 0.8775 apart).
      id: "training:dumbbell-left-plate",
      position: [0.2501, -0.5961, -0.1887],
      normal: [0, 1, 0],
      tangent: [0.9005, 0, 0.435],
      ownerId: "grab:dumbbell:training:left",
    },
    {
      // The far corner of the lid ring, measured off the surface probe rather
      // than inferred from the owner box.
      //
      // The lid is a flat annulus at y 0.4120 with an exactly vertical normal,
      // and the flip spout rises off it to 0.4504 on the LOW-x side. The old
      // anchor sat on the ring at x 1.085 — correct height, wrong corner —
      // immediately beside that spout, so the complete resting envelope
      // intersected it and the live check rejected this Perch as
      // `resting-pose-blocked` on every run. Owner review: "should land on the
      // top corner, not middle single that's blocked."
      //
      // x is also the crowded axis: three shakers stand 0.2 apart and each is
      // 0.182 wide, leaving 1.8 cm between neighbours. So the clear corner is
      // mid-ring in x, away from the spout without closing on the amber
      // shaker, and as far out in z as the ring goes — z is the only axis with
      // open air on both sides.
      id: "training:navy-shaker-rim",
      position: [1.1213, 0.412, -0.0459],
      normal: [0, 1, 0],
      tangent: [1, 0, 0],
      ownerId: "grab:shaker:training-navy",
      contactDistanceTolerance: 0.02,
    },
    {
      // The kettlebell moved to the floor and the compact dumbbell took its
      // place on the top shelf, so this is the inner plate of that dumbbell:
      // the same flat plate top the left dumbbell offers, on the other side
      // of the board.
      // This dumbbell now stands front-to-back at the top-left, in the pose
      // the left one used to hold, at scale 1.42 instead of 1.55 and yaw
      // 1.3: the left dumbbell's measured plate point, scaled by 1.42/1.55
      // and carried to base [-1.1, 0, 0.18].
      id: "training:dumbbell-right-plate",
      position: [-1.1645, 0.2608, 0.3314],
      normal: [0, 1, 0],
      tangent: [0.2675, 0, -0.9636],
      ownerId: "grab:dumbbell:training:right",
    },
    {
      // The seventh Perch on this unit, and it exists because the catalogue
      // holds every unit to exactly seven: the Sunkist lid left with the can
      // pyramid on 2026-08-29, and the pickleball print took both its slot on
      // the plank and its place here. A frame top is the same flat contact
      // every other print on this shelf offers.
      id: "training:pickleball-frame-top",
      position: [-0.1217, -0.5186, 0.0512],
      normal: [0.0102, 0.9954, -0.0951],
      tangent: [0.982, 0, -0.189],
      ownerId: "grab:photo:training-pickleball-group-v8",
    },
    {
      id: "training:golf-flag-frame-top",
      position: [-0.6876, -0.4764, 0.1023],
      normal: [0.0198, 0.9945, -0.1026],
      tangent: [0.9998, -0.0197, 0.002],
      ownerId: "grab:photo:training-golf-flag-v8",
    },
  ],
  [
    {
      id: "systems:working-session-frame",
      position: [-0.221, 0.3447, 0.0811],
      normal: [0, 1, 0],
      tangent: [0.994, 0, -0.1098],
      ownerId: "grab:photo:systems-working-session-v8",
    },
    {
      // The print came back to the shelf on 2026-08-23 — on the lower plank
      // now, standing behind the pill cases it shows — so the anchor moved
      // down with it. Exact ownerId keeps the anchor advisory; the resolver
      // finds the frame's real top from the prop itself.
      id: "systems:supplements-frame",
      position: [0.66, -0.57, -0.15],
      normal: [0, 1, 0],
      tangent: [0.995, 0, -0.0998],
      ownerId: "grab:photo:systems-supplements-v8",
    },
    {
      id: "systems:sf-dusk-frame",
      position: [-0.6385, -0.5095, 0.1211],
      normal: [0, 1, 0],
      tangent: [0.9856, 0, 0.1692],
      ownerId: "grab:photo:systems-sf-dusk-v8",
    },
    {
      // The lake print left the plank on 2026-08-23 when the supplements
      // print returned, taking its perch's owner with it; the home-office
      // frame on the top shelf had never carried a site and inherits the
      // fourth frame-top slot.
      id: "systems:home-office-frame",
      position: [0.27, 0.368, 0.09],
      normal: [0, 1, 0],
      tangent: [0.9872, 0, -0.1593],
      ownerId: "grab:photo:systems-home-office-v8",
    },
    {
      id: "systems:lamp-crown",
      // Anchor and normal are the MEASURED contact, read back off the resolver
      // rather than guessed from a bounding box. That method has not changed
      // since the desk lamp stood here; what changed is the fixture. The
      // sunlamp is a flat panel leaning back on a kickstand, so there is no
      // cone to land on and the only up-facing surface is the rounded top
      // edge — a ridge about a centimetre across, which is why the anchor is
      // read off a 41-step probe rather than a 9-step one.
      position: [1.0789, -0.3316, -0.239],
      normal: [-0.0241, 0.9985, 0.0487],
      // Along the ridge, not across it. The panel is yawed -0.34 in the unit,
      // so its width runs [cos, 0, -sin] of that; a moth landed square to the
      // edge would be standing on a knife.
      tangent: [0.943, 0, 0.334],
      ownerId: "egg:lamp:3",
      lampId: "desk-lamp-3",
      // The round-over is bevelled in four segments, so consecutive facets on
      // the crown differ by up to 25°. 0.9 accepts all of them and still
      // rejects the shoulder facets, where a resident would be standing on the
      // side of the panel.
      normalTolerance: 0.9,
    },
    {
      id: "systems:alarm-clock-crown",
      position: [-0.66, 0.304, 0.25],
      normal: [0, 1, 0],
      tangent: [1, 0, 0],
      // The crown is two bells with no flat top between them, so without a
      // tight tolerance the probe slides onto the clock's vertical face and
      // stands the insect up like a fridge magnet.
      normalTolerance: 0.8,
      ownerId: "egg:clock:alarm",
    },
    {
      // The notebook's cover, over from Projects with the notebook on
      // 2026-08-23 when the lighthouse print (and its frame-top Perch) left
      // for Musings. The pad is 0.018 thick at its 0.052 scale, so the
      // contact is one cover height over the plank, a little right of and
      // behind its centre so the resident sits on the pages, not the spine.
      id: "systems:notebook-cover",
      position: [0.1, SHELF_SURFACE.lower + 0.018, -0.04],
      normal: [0, 1, 0],
      tangent: [0.976, 0, 0.218],
      ownerId: "grab:notebook:systems",
    },
  ],
  [
    {
      id: "projects:trophy",
      position: [-0.7427, -0.3896, 0.0547],
      normal: [0, 1, 0],
      tangent: [0.9553, 0, -0.2955],
      ownerId: "grab:trophy",
    },
    {
      id: "projects:apple-portrait-frame-top",
      ...PROJECTS_APPLE_FRAME_PERCH,
      ownerId: "grab:photo:projects-wwdc-v8",
    },
    {
      // Measured at phoneX 0.54 as [0.4118, −0.7928, −0.0724]; the phone
      // slid to −0.04 on 2026-08-23 when the notebook left, so the anchor
      // rides the layout constant by the same offset.
      id: "projects:phone-face",
      position: [
        REVIEWED_SHELF_LAYOUT.projects.phoneX - 0.1282,
        -0.7928,
        -0.0724,
      ],
      normal: [0, 1, 0],
      tangent: [0.9611, 0, -0.2764],
      ownerId: "grab:phone:projects",
    },
    {
      // The Mac lives in a 0.199 m slot: its screen top measures y −0.1986 and
      // the underside of `shelf:4:top` is y 0.0. That is the whole story of
      // this Perch, and the numbers are brutal at the default clearance —
      // the Arrival Curve's mouth sits `clearance` above the contact and the
      // pilot is swept as an 0.08 m sphere, so 0.12 puts the top of that sphere
      // at y +0.0014: fourteen ten-thousandths of a metre INSIDE the plank.
      // Measured result was `route-unreachable`, blocked by `shelf:4:top`,
      // which is exactly what a site you can miss by a millimetre looks like.
      // Owner review: "the mac still doesn't seem to allow butterflies."
      //
      // 0.09 lowers the mouth to −0.1086 and the swept sphere's top to −0.0286,
      // clearing the plank by 2.9 cm even with the plan dilation. The anchor
      // also moves to the crest the probe actually found (y −0.1986 rather than
      // −0.216), which is another 1.7 cm of the same scarce air.
      id: "projects:mac-top",
      position: [0.9205, -0.1986, 0.0229],
      normal: [0.033, 0.991, -0.133],
      tangent: [0.9428, 0, 0.3335],
      ownerId: "action:projects:mac",
      clearance: 0.09,
    },
    {
      id: "projects:weightlifting-icon-top",
      position: [
        REVIEWED_SHELF_LAYOUT.projects.topWeightliftingIconX,
        0.355,
        0.02,
      ],
      normal: [0, 1, 0],
      tangent: [0.9976, 0, -0.0699],
      ownerId: "action:projects:weightlifting",
    },
    {
      id: "projects:dice-pyramid-top",
      position: [REVIEWED_SHELF_LAYOUT.projects.topDiceCenterX, 0.515, 0],
      normal: [0, 1, 0],
      tangent: [0.9992, 0, 0.04],
      ownerId: "link:projects:dice:top",
    },
    {
      id: "projects:homework-icon-top",
      position: [REVIEWED_SHELF_LAYOUT.projects.topHomeworkIconX, 0.355, 0.02],
      normal: [0, 1, 0],
      tangent: [0.9976, 0, 0.0699],
      ownerId: "action:projects:homework",
    },
  ],
  [
    {
      id: "musings:writing-paper",
      position: [MUSINGS_LOWER_LAYOUT.paperX - 0.16, -0.8291, -0.02],
      normal: [0, 1, 0],
      tangent: [0.9892, 0, -0.1463],
      ownerId: "grab:paper:5",
    },
    {
      // The reclined cover of the printed Trust essay on its reading stand,
      // derived from the same constants the prop is built from; the lamp
      // shade is the precedent for a Perch on a tilted face. Analytic rather
      // than read back from the running scene — re-measure from the HUD the
      // next time the scene is open and copy the contact back here.
      id: "musings:trust-cover",
      position: MUSINGS_TRUST_COVER_PERCH.position,
      normal: MUSINGS_TRUST_COVER_PERCH.normal,
      tangent: [1, 0, 0],
      ownerId: "grab:trust-essay:musings",
    },
    {
      id: "musings:open-book-page",
      position: MUSINGS_OPEN_BOOK_PERCH_POSITION,
      normal: [0, 1, 0],
      tangent: [0.9689, 0, 0.2474],
      ownerId: "grab:openbook",
    },
    {
      id: "musings:tea-handle",
      position: MUSINGS_TEA_HANDLE_POSITION,
      normal: [0, 1, 0],
      tangent: [0.5646, 0, 0.8253],
      ownerId: "egg:tea",
    },
    {
      id: "musings:lamp-shade",
      // The shade now turns toward the open book and cup. Its authored contact
      // follows the same recovered hinge as the rendered model and light rig.
      position: MUSINGS_LAMP_SHADE_PERCH.position,
      normal: MUSINGS_LAMP_SHADE_PERCH.normal,
      ownerId: "egg:lamp:5",
      lampId: "desk-lamp-5",
      normalTolerance: 0.9,
    },
    {
      id: "musings:headphone-band",
      position: MUSINGS_HEADPHONE_PERCH_POSITION,
      normal: [0, 1, 0],
      tangent: [1, 0, 0],
      ownerId: "grab:headphones",
    },
    {
      // The lantern dome, camera side, copied back from the resolved
      // triangle contact (UnitBlog.landing.test.ts lands five variations on
      // it against the real GLB). Not the gallery deck or the plinth ledge:
      // both measured as flat and both are blocked, because the brick tower,
      // deck and drum weld into one collision island whose box reaches the
      // lantern floor — the same hull-sized-blocker problem the sailboat's
      // masthead had, now at the other end of the prop.
      id: "musings:lighthouse-dome",
      position: [MUSINGS_LOWER_LAYOUT.lighthouseX + 0.018, -0.2805, -0.062],
      normal: [0.2631, 0.9037, 0.3377],
      tangent: [0.7891, 0, -0.6143],
      ownerId: "grab:lighthouse:musings",
    },
  ],
  [
    {
      // Down the barrel, away from the pothos. Owner review: "microphone also
      // seems intermittently unlandable" — measured `resting-pose-blocked` on
      // 90% of samples, and the margin is almost comic. The plant's collider
      // runs from world x 27.1766; the old contact sat at 27.1277, so the pot
      // was 4.9 cm away and a butterfly's resting envelope is 5.0 cm long. It
      // failed by a millimetre, which is why it read as intermittent rather
      // than as broken.
      //
      // The plant is a bushy prop with an honestly large box and shrinking it
      // would be lying about where its leaves are. The Perch moves instead:
      // 18 cm along the mic, which is still the microphone and is no longer
      // inside a houseplant.
      // The mic moved +0.08 with the easel's arrival; the crown Perch rides
      // along. Still 0.16 clear of the pothos collider at local x 0.7766,
      // three envelope-lengths from the failure the note above measured.
      id: "talks:microphone-crown",
      position: [0.6111, -0.7721, 0.1237],
      normal: [-0.095, 0.922, 0.374],
      tangent: [0.9759, 0, 0.2182],
      ownerId: "grab:microphone",
    },
    {
      id: "talks:harmonica-deck",
      position: [0.97, 0.0903, 0.08],
      normal: [0, 1, 0],
      tangent: [0.9801, 0, 0.1987],
      ownerId: "grab:harmonica:talks",
    },
    {
      // Frame-top Perches in this unit are generated, not probed: the talk
      // gallery's poses are solved in talkGalleryLayout.ts, so each top edge
      // and its normal come from the same math the renderer uses (see
      // scripts note in that module's test). Re-run the numbers after any
      // repose: top edge centre, normal/tangent = rest-rotated ŷ/x̂.
      id: "talks:consensus-frame-top",
      position: [0.0411, -0.19, 0.0121],
      normal: [0, 1, 0],
      tangent: [0.9902, 0, 0.1395],
      ownerId: "grab:photo:talk-consensus-phone-v8",
    },
    {
      id: "talks:demo-night-frame-top",
      position: [-0.8984, -0.3437, -0.2793],
      normal: [0.012, 0.9126, -0.4086],
      tangent: [0.9967, -0.0435, -0.0681],
      ownerId: "grab:photo:talk-demo-night-v8",
    },
    {
      // The SIDE of the shade, not its lid — owner review: "for the lights can
      // we have the butterflies and moths land on the side rather than on top?
      // Especially for the big floor one." A replacement rather than an
      // addition, both because that is what "rather than" asks for and because
      // a shelf holds seven Perches on seven distinct props.
      //
      // Every lamp Perch in this catalogue was on a top surface, and not by
      // choice: the authoring probe casts rays straight DOWN, so a vertical
      // shade wall was invisible to it and the only thing it could ever propose
      // was the rim. `probeSide` fires inward instead, and the camera-facing
      // wall of this shade measures 7° off vertical over a 40 cm band — a real
      // surface that was simply unmeasurable before, 20 cm below the old rim.
      //
      // It is also where the light is. A moth on the lid of a lampshade is
      // sitting on the one part of it that is dark. The remaining desk lamps
      // needed no such move: their shades are tilted, so `musings:lamp-shade`
      // already resolves 81° off vertical. (`systems:lamp-shade` was the third
      // such case at 56°; the sunlamp that replaced that fixture has no shade
      // at all, and `systems:lamp-crown` sits on its top edge, which is a lit
      // surface for the same reason this flank is.) This one aimed straight
      // down and was the only Perch in the room dead on top of a lamp.
      id: "talks:floor-lamp-flank",
      position: [-2.1379, 1.1318, 0.2382],
      normal: [0.027, 0.122, 0.992],
      tangent: [0.9963, 0, -0.0271],
      ownerId: "egg:lamp:floor:6",
      lampId: "talks-floor-lamp-6",
      normalTolerance: 0.85,
      clearance: 0.15,
    },
    {
      id: "talks:panel-frame-top",
      position: [0.4992, 0.4511, -0.0577],
      normal: [-0.0099, 0.9711, -0.2387],
      tangent: [0.995, 0.0334, 0.0946],
      ownerId: "grab:photo:talk-panel-v8",
    },
    {
      id: "talks:dc-policy-frame-top",
      position: [-0.2759, 0.6868, -0.0081],
      normal: [0.0127, 0.9839, -0.1781],
      tangent: [0.9975, 0, 0.0711],
      ownerId: "grab:photo:talk-dc-policy-v8",
    },
  ],
] as const;

export function UnitInsectPerches({
  unitIndex,
  definitions,
}: {
  unitIndex: number;
  definitions?: readonly PerchDefinition[];
}) {
  return (
    <group name={`insect-perches:${unitIndex}`}>
      {(definitions ?? UNIT_PERCHES[unitIndex] ?? []).map((perch) => (
        <PerchAnchor key={perch.id} unitIndex={unitIndex} {...perch} />
      ))}
    </group>
  );
}

export function insectPerchCatalog() {
  return UNIT_PERCHES;
}
