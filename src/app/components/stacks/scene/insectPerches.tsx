"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

import type { InsectPerchRejectionCode } from "./insectPerchDiagnostic";
import {
  getSceneInteraction,
  sceneInteractionInventory,
} from "./interactionRegistry";
import { getMeadowLamps } from "./meadowLights";

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
  const anchor = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (!anchor.current) return;
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
      anchor: anchor.current,
      normal,
      resolvedRoot: null,
      resolvedSurface: null,
      resolvedOwnerId: null,
      localPosition: new THREE.Vector3(),
      localNormal: new THREE.Vector3(0, 1, 0),
    };
    return registerInsectPerch(perch);
  }, [
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
  return <object3D ref={anchor} position={position} visible={false} />;
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
const CONTACT_PROBES = [0.14, 0.32, 0.5, 0.68, 0.86] as const;

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
  perch.resolvedRoot = null;
  perch.resolvedSurface = null;
  perch.resolvedOwnerId = null;
  const owner = resolveOwner(perch);
  if (!owner) return { ok: false, rejectionCode: "owner-not-found" };
  const root = owner.root;
  root.updateWorldMatrix(true, true);
  perch.anchor.getWorldPosition(CONTACT_AUTHORED_POSITION);
  perch.anchor.getWorldQuaternion(CONTACT_AUTHORED_QUATERNION);
  CONTACT_AUTHORED_NORMAL.set(...perch.normal)
    .applyQuaternion(CONTACT_AUTHORED_QUATERNION)
    .normalize();
  CONTACT_BOX.setFromObject(root, true);
  if (CONTACT_BOX.isEmpty()) return { ok: false, rejectionCode: "owner-empty" };
  CONTACT_SURFACES.length = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) CONTACT_SURFACES.push(object);
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
  perch.resolvedRoot = root;
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
const UNIT_PERCHES: readonly (readonly PerchDefinition[])[] = [
  [
    {
      id: "about:aic-crown",
      position: [-0.4747, -0.6345, -0.0753],
      normal: [0, 1, 0],
      tangent: [0.9928, 0, 0.1197],
      ownerId: "grab:ai-collective-mark",
    },
    {
      id: "about:portrait-frame-top",
      position: [-0.4211, 1.0002, -0.1101],
      normal: [0, 0.9982, -0.06],
      tangent: [0.9982, -0.0036, -0.0599],
      // `LoosePhoto` in UnitAbout registers `grab:photo:<id>`. The
      // `link:photo:` prefix belongs to `Photo` in photos.tsx, which the About
      // portrait does not use, so this named an owner that has never existed
      // and the Perch was rejected on every frame since it was authored.
      ownerId: "grab:photo:portrait",
    },
    {
      id: "about:globe-crown",
      position: [-1.2072, 0.5241, -0.0117],
      normal: [-0.2467, 0.9238, 0.2929],
      tangent: [0.7648, 0, 0.6442],
      ownerId: "egg:globe",
    },
    {
      id: "about:lamp-shade",
      position: [-0.6848, -0.2193, -0.0106],
      normal: [-0.2812, 0.9166, -0.2842],
      tangent: [0.7109, 0, -0.7033],
      ownerId: "egg:lamp:0",
      lampId: "desk-lamp-0",
    },
    {
      id: "about:tj-medallion-rim",
      position: [-0.24, -0.589, -0.08],
      normal: [0, 1, 0],
      tangent: [1, 0, 0],
      ownerId: "grab:tj-medallion:about",
    },
    {
      id: "about:other-minds-top",
      position: [0.69, -0.347, 0.15],
      normal: [0, 1, 0],
      tangent: [0.97, 0, 0.243],
      ownerId: "grab:reading:other-minds",
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
  ],
  [
    {
      // The near plate. The Perch this replaces sat at z −1.70, behind the
      // shelf and behind the Flight Volume's back wall — a site no resident
      // could reach and no visitor could see.
      id: "training:barbell-front-plate",
      position: [2.663, -0.6327, -0.382],
      normal: [0.2707, 0.9238, -0.2707],
      tangent: [0.7071, 0, 0.7071],
      ownerId: "grab:barbell",
    },
    {
      id: "training:protein-lid",
      position: [0.38, -0.2824, 0.04],
      normal: [0, 1, 0],
      tangent: [0.9553, 0, -0.2955],
      ownerId: "grab:protein",
    },
    {
      id: "training:dumbbell-left-plate",
      position: [-1.1097, 0.2814, 0.3055],
      normal: [0, 1, 0],
      tangent: [0.3809, 0, -0.9246],
      ownerId: "grab:dumbbell:training:left",
    },
    {
      id: "training:navy-shaker-mouthpiece",
      position: [1.085, 0.412, 0],
      normal: [0, 1, 0],
      tangent: [1, 0, 0],
      ownerId: "grab:shaker:training-navy",
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
      id: "systems:supplements-frame",
      position: [0.361, 0.3275, 0.1311],
      normal: [0, 1, 0],
      tangent: [0.994, 0, 0.1098],
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
      id: "systems:lake-frame",
      position: [-0.1909, -0.5095, 0.121],
      normal: [0, 1, 0],
      tangent: [0.995, 0, -0.0998],
      ownerId: "grab:photo:systems-lake-v8",
    },
    {
      id: "systems:lamp-shade",
      position: [1.02, -0.39, 0.08],
      normal: [-0.35, 0.9, 0.22],
      ownerId: "egg:lamp:3",
      lampId: "desk-lamp-3",
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
      id: "projects:notebook-page",
      position: [0.0231, -0.8245, -0.1475],
      normal: [0, 1, 0],
      tangent: [0.9759, 0, 0.2182],
      ownerId: "grab:notebook:projects",
    },
    {
      id: "projects:phone-face",
      position: [0.4118, -0.7928, -0.0724],
      normal: [0, 1, 0],
      tangent: [0.9611, 0, -0.2764],
      ownerId: "grab:phone:projects",
    },
    {
      id: "projects:mac-top",
      position: [0.8765, -0.216, -0.128],
      normal: [0.0457, 0.9906, -0.1291],
      tangent: [0.9428, 0, 0.3335],
      ownerId: "link:projects:mac",
    },
  ],
  [
    {
      id: "musings:writing-paper",
      position: [-0.48, -0.7925, -0.012],
      normal: [0, 1, 0],
      tangent: [0.9892, 0, -0.1463],
      ownerId: "grab:paper:5",
    },
    {
      id: "musings:book-pile-top",
      position: [0.42, -0.6545, 0],
      normal: [0, 1, 0],
      tangent: [0.9964, 0, -0.0845],
      ownerId: "grab:pile:5:47:2",
    },
    {
      id: "musings:open-book-page",
      position: [0.6222, 0.1205, 0.1168],
      normal: [0, 1, 0],
      tangent: [0.9689, 0, 0.2474],
      ownerId: "grab:openbook",
    },
    {
      id: "musings:tea-rim",
      position: [0.39, 0.1526, -0.08],
      normal: [0, 1, 0],
      tangent: [0.8253, 0, -0.5646],
      ownerId: "egg:tea",
    },
    {
      id: "musings:lamp-shade",
      position: [-1, 0.48, 0.04],
      normal: [0.3, 0.92, 0.2],
      ownerId: "egg:lamp:5",
      lampId: "desk-lamp-5",
    },
    {
      id: "musings:headphone-band",
      position: [0.04, 0.387, 0.14],
      normal: [0, 1, 0],
      tangent: [1, 0, 0],
      ownerId: "grab:headphones",
    },
    {
      // The top of the rig, measured off the resolved contact rather than
      // guessed from the model's bounding box — the mast's own AABB is shared
      // with the hull, so its top edge is 13 cm above any surface a probe can
      // actually hit.
      id: "musings:sailboat-masthead",
      position: [0.9295, -0.5023, -0.0597],
      normal: [0.2844, 0.9581, 0.0343],
      tangent: [0.9564, 0, -0.292],
      ownerId: "grab:sailboat:musings",
    },
  ],
  [
    {
      id: "talks:microphone-crown",
      position: [0.7132, -0.7469, 0.1811],
      normal: [-0.082, 0.927, 0.366],
      tangent: [0.9759, 0, 0.2182],
      ownerId: "grab:microphone",
    },
    {
      id: "talks:harmonica-deck",
      position: [0.82, 0.0903, 0.08],
      normal: [0, 1, 0],
      tangent: [0.9801, 0, 0.1987],
      ownerId: "grab:harmonica:talks",
    },
    {
      id: "talks:consensus-frame-top",
      position: [-0.3721, 0.4503, -0.0455],
      normal: [-0.012, 0.9967, -0.0804],
      tangent: [0.9991, 0.0152, 0.0389],
      ownerId: "grab:photo:talk-consensus-phone-v8",
    },
    {
      id: "talks:demo-night-frame-top",
      position: [-0.9067, -0.3541, -0.0363],
      normal: [0.0179, 0.9973, -0.0719],
      tangent: [0.9938, -0.0256, -0.1082],
      ownerId: "grab:photo:talk-demo-night-v8",
    },
    {
      id: "talks:floor-lamp-rim",
      position: [-2.0038, 1.336, -0.0199],
      normal: [0, 1, 0],
      tangent: [0.9004, 0, -0.435],
      ownerId: "egg:lamp:floor:6",
      lampId: "talks-floor-lamp-6",
      clearance: 0.15,
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
