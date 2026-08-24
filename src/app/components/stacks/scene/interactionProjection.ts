"use client";

import type { ProjectedInteractionBounds } from "../mobile/halos";
import type * as THREE from "three";
import { Box3, Matrix4, Raycaster, Vector2, Vector3 } from "three";

import {
  type ProjectedDoor,
  type ProjectedScreenPoint,
  getSceneInteraction,
  sceneInteractionInventory,
  setDoorProjectionResolver,
  setInteractionRectProjectionResolver,
} from "./interactionRegistry";

let projectionCamera: THREE.Camera | null = null;
let projectionElement: HTMLElement | null = null;
const projectionPoint = new Vector3();
const pointerRaycaster = new Raycaster();
const pointerNdc = new Vector2();
const localBoundsCache = new WeakMap<
  THREE.Object3D,
  { descendants: number; bounds: THREE.Box3 }
>();
const rootInverse = new Matrix4();
const childToRoot = new Matrix4();
const corner = new Vector3();

/** `Object3D.visible` only describes the object itself. Three also hides an
 * object when any ancestor is invisible, so touch projection must apply the
 * same effective-visibility rule or a dormant presentation branch can leave
 * an invisible Halo over a live prop. */
function isEffectivelyVisible(root: THREE.Object3D) {
  for (let node: THREE.Object3D | null = root; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

function descendantCount(root: THREE.Object3D) {
  let count = 0;
  root.traverse(() => count++);
  return count;
}

/** Measure once in the interaction root's own coordinates. Moving a
 * Grabbable then changes only root.matrixWorld; its visual box stays valid. */
function rootLocalBounds(spec: ReturnType<typeof getSceneInteraction>) {
  if (!spec) return null;
  if (spec.projectedLocalBounds)
    return new Box3(
      new Vector3(...spec.projectedLocalBounds.min),
      new Vector3(...spec.projectedLocalBounds.max),
    );
  spec.root.updateWorldMatrix(true, true);
  const descendants = descendantCount(spec.root);
  const cached = localBoundsCache.get(spec.root);
  if (cached?.descendants === descendants) return cached.bounds;
  rootInverse.copy(spec.root.matrixWorld).invert();
  const bounds = new Box3().makeEmpty();
  spec.root.traverse((node) => {
    const geometry = (node as THREE.Mesh).geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box || box.isEmpty()) return;
    childToRoot.multiplyMatrices(rootInverse, node.matrixWorld);
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          bounds.expandByPoint(corner.set(x, y, z).applyMatrix4(childToRoot));
  });
  if (bounds.isEmpty())
    bounds.setFromCenterAndSize(new Vector3(), new Vector3(0.01, 0.01, 0.01));
  localBoundsCache.set(spec.root, { descendants, bounds });
  return bounds;
}

export function projectedInteractionBounds(pointer?: {
  x: number;
  y: number;
}): ProjectedInteractionBounds[] {
  if (!projectionCamera || !projectionElement) return [];
  const rect = projectionElement.getBoundingClientRect();
  // `activeUnits` records which authored shelf owns an interaction. It is not
  // a visibility boundary: neighboring shelves remain on screen during
  // travel and at intermediate authored stops such as Golf. The camera and
  // the rendered hierarchy decide what touch can reach.
  const specs = sceneInteractionInventory().filter(
    (spec) => spec.touchable !== false && isEffectivelyVisible(spec.root),
  );
  let exactId: string | null = null;
  if (pointer && rect.width > 0 && rect.height > 0) {
    pointerNdc.set(
      ((pointer.x - rect.left) / rect.width) * 2 - 1,
      -((pointer.y - rect.top) / rect.height) * 2 + 1,
    );
    pointerRaycaster.setFromCamera(pointerNdc, projectionCamera);
    const roots = new Map<THREE.Object3D, string>();
    for (const spec of specs) roots.set(spec.root, spec.id);
    for (const hit of pointerRaycaster.intersectObjects(
      specs.map((s) => s.root),
      true,
    )) {
      for (
        let node: THREE.Object3D | null = hit.object;
        node;
        node = node.parent
      ) {
        const id = roots.get(node);
        if (id) {
          exactId = id;
          break;
        }
      }
      if (exactId) break;
    }
  }
  const results: ProjectedInteractionBounds[] = [];
  for (const spec of specs) {
    const bounds = rootLocalBounds(spec);
    if (!bounds) continue;
    spec.root.updateWorldMatrix(true, false);
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    let depth = Infinity;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          corner
            .set(x, y, z)
            .applyMatrix4(spec.root.matrixWorld)
            .project(projectionCamera);
          left = Math.min(
            left,
            rect.left + (corner.x * 0.5 + 0.5) * rect.width,
          );
          right = Math.max(
            right,
            rect.left + (corner.x * 0.5 + 0.5) * rect.width,
          );
          top = Math.min(top, rect.top + (-corner.y * 0.5 + 0.5) * rect.height);
          bottom = Math.max(
            bottom,
            rect.top + (-corner.y * 0.5 + 0.5) * rect.height,
          );
          depth = Math.min(depth, corner.z);
        }
    if (
      depth < -1 ||
      depth > 1 ||
      !Number.isFinite(left) ||
      right < rect.left ||
      left > rect.right ||
      bottom < rect.top ||
      top > rect.bottom
    )
      continue;
    results.push({
      id: spec.id,
      left,
      right,
      top,
      bottom,
      depth,
      priority: spec.touchPriority,
      exactHit: spec.id === exactId,
    });
  }
  return results;
}

function projectDoorWithContext(id: string): ProjectedDoor | null {
  const spec = getSceneInteraction(id);
  if (
    !spec ||
    (spec.activation?.kind !== "door" && spec.activation?.kind !== "action")
  )
    return null;
  if (
    !projectionCamera ||
    !projectionElement ||
    !isEffectivelyVisible(spec.root)
  )
    return null;
  // Registration often happens on a carrier Group while its visible model is
  // still loading. Keep that carrier's world transform current so it remains
  // a stable object-owned anchor even before (or without) measurable child
  // geometry.
  spec.root.updateWorldMatrix(true, true);
  const localBounds = rootLocalBounds(spec);
  if (!localBounds || localBounds.isEmpty()) {
    // An empty carrier is still the linked object. Its world origin is a much
    // better fallback than the live pointer: the tooltip stays attached while
    // the visitor moves between neighbouring links or the model streams in.
    spec.root.getWorldPosition(projectionPoint);
  } else {
    projectionPoint.set(
      (localBounds.min.x + localBounds.max.x) / 2,
      localBounds.max.y,
      (localBounds.min.z + localBounds.max.z) / 2,
    );
    projectionPoint.applyMatrix4(spec.root.matrixWorld);
  }
  projectionPoint.project(projectionCamera);
  const rect = projectionElement.getBoundingClientRect();
  return {
    x: rect.left + (projectionPoint.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-projectionPoint.y * 0.5 + 0.5) * rect.height,
    behind: projectionPoint.z < -1 || projectionPoint.z > 1,
  };
}

/** Live projected bounds for a visual handoff into DOM. Unlike touch bounds,
 * this deliberately bypasses the local-bounds cache so an artifact that has
 * already tilted toward the pointer starts its preview from that rendered
 * pose rather than from its authored rest pose. */
function projectInteractionRectWithContext(id: string) {
  const spec = getSceneInteraction(id);
  if (
    !spec ||
    !projectionCamera ||
    !projectionElement ||
    !isEffectivelyVisible(spec.root)
  )
    return null;
  spec.root.updateWorldMatrix(true, true);
  const bounds = spec.projectedLocalBounds
    ? new Box3(
        new Vector3(...spec.projectedLocalBounds.min),
        new Vector3(...spec.projectedLocalBounds.max),
      )
    : (() => {
        rootInverse.copy(spec.root.matrixWorld).invert();
        const live = new Box3().makeEmpty();
        spec.root.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (
            !mesh.geometry ||
            !node.visible ||
            (node.userData as { physicsIgnore?: boolean }).physicsIgnore ===
              true
          )
            return;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const box = mesh.geometry.boundingBox;
          if (!box || box.isEmpty()) return;
          childToRoot.multiplyMatrices(rootInverse, node.matrixWorld);
          for (const x of [box.min.x, box.max.x])
            for (const y of [box.min.y, box.max.y])
              for (const z of [box.min.z, box.max.z])
                live.expandByPoint(
                  corner.set(x, y, z).applyMatrix4(childToRoot),
                );
        });
        return live;
      })();
  if (bounds.isEmpty()) return null;

  const viewport = projectionElement.getBoundingClientRect();
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let depth = Infinity;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner
          .set(x, y, z)
          .applyMatrix4(spec.root.matrixWorld)
          .project(projectionCamera);
        left = Math.min(
          left,
          viewport.left + (corner.x * 0.5 + 0.5) * viewport.width,
        );
        right = Math.max(
          right,
          viewport.left + (corner.x * 0.5 + 0.5) * viewport.width,
        );
        top = Math.min(
          top,
          viewport.top + (-corner.y * 0.5 + 0.5) * viewport.height,
        );
        bottom = Math.max(
          bottom,
          viewport.top + (-corner.y * 0.5 + 0.5) * viewport.height,
        );
        depth = Math.min(depth, corner.z);
      }
  if (
    depth < -1 ||
    depth > 1 ||
    !Number.isFinite(left) ||
    right <= left ||
    bottom <= top
  )
    return null;

  // The print's own face, corner by corner (TL, TR, BR, BL), in whatever
  // pose it is rendered: lying flat, hover-hinged, rolled. The root's local
  // x/y plane is NOT that face — a flat print's rest rotation and the hover
  // hinge live INSIDE the root — so the face is found from the geometry:
  // the photo plane is the subtree's largest flat mesh, its world matrix is
  // the face's basis, and the whole subtree's extent in that basis is the
  // framed print. A preview opening from anything less snaps an angled
  // print upright on its first frame.
  const face = faceQuadForSubtree(spec.root, viewport);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    ...(face ? { quad: face } : {}),
  };
}

const facePosition = new Vector3();
const faceU = new Vector3();
const faceV = new Vector3();
const faceOrigin = new Vector3();
const faceCandidateSize = new Vector3();
const faceDelta = new Vector3();

/** A framed print's face plane, in world space: the two in-plane axes (v the
 * more world-vertical one), a point on the plane, and the whole subtree's
 * extent in that basis (world units). The Grabbable handoff aims THIS at the
 * camera — a flat print's tilt is authored on children inside the
 * interaction root, so the root's own axes say nothing about the face. */
export type ArtifactFaceBasis = {
  u: THREE.Vector3;
  v: THREE.Vector3;
  origin: THREE.Vector3;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
};

export function artifactFaceBasis(
  root: THREE.Object3D,
): ArtifactFaceBasis | null {
  // The face carrier: the largest mesh that is flat (thin in one local
  // axis). The photo plane wins where textures are mounted; the mount or
  // frame box wins on the low tier that skips textures.
  let carrier: THREE.Mesh | null = null;
  let carrierArea = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (
      !mesh.geometry ||
      !node.visible ||
      (node.userData as { physicsIgnore?: boolean }).physicsIgnore === true
    )
      return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box || box.isEmpty()) return;
    box.getSize(faceCandidateSize);
    const { x, y, z } = faceCandidateSize;
    const thin = Math.min(x, y, z);
    const spans = [x, y, z].sort((a, b) => a - b);
    // Flat: at most a tenth as thick as its second dimension.
    if (thin > spans[1]! * 0.1) return;
    const area = spans[1]! * spans[2]!;
    if (area <= carrierArea) return;
    carrier = mesh;
    carrierArea = area;
  });
  if (!carrier) return null;

  // The carrier's own basis, with its thin axis as the normal: u and v are
  // the two in-plane world directions, faceOrigin a point on the plane.
  const flat: THREE.Mesh = carrier;
  const box = flat.geometry.boundingBox!;
  box.getSize(faceCandidateSize);
  const axes: ["x", "y", "z"] = ["x", "y", "z"];
  const thinAxis = axes.reduce((thinnest, axis) =>
    faceCandidateSize[axis] < faceCandidateSize[thinnest] ? axis : thinnest,
  );
  const inPlane = axes.filter((axis) => axis !== thinAxis);
  faceU.setFromMatrixColumn(flat.matrixWorld, axes.indexOf(inPlane[0]!));
  faceV.setFromMatrixColumn(flat.matrixWorld, axes.indexOf(inPlane[1]!));
  if (faceU.lengthSq() === 0 || faceV.lengthSq() === 0) return null;
  faceU.normalize();
  faceV.normalize();
  // v must be the face's screen-up; image planes author +y up, but a face
  // carried on x/z (a print lying flat) has no authored up. Keep whichever
  // of the two axes is more vertical in WORLD as v so TL really is top-left.
  if (Math.abs(faceV.y) < Math.abs(faceU.y)) {
    const swap = faceU.clone();
    faceU.copy(faceV);
    faceV.copy(swap);
  }
  flat.getWorldPosition(faceOrigin);

  // The framed print's extent in that basis: every geometry corner of the
  // subtree, projected onto the plane.
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (
      !mesh.geometry ||
      !node.visible ||
      (node.userData as { physicsIgnore?: boolean }).physicsIgnore === true
    )
      return;
    const box = mesh.geometry.boundingBox;
    if (!box || box.isEmpty()) return;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          faceDelta.set(x, y, z).applyMatrix4(node.matrixWorld).sub(faceOrigin);
          const u = faceDelta.dot(faceU);
          const v = faceDelta.dot(faceV);
          uMin = Math.min(uMin, u);
          uMax = Math.max(uMax, u);
          vMin = Math.min(vMin, v);
          vMax = Math.max(vMax, v);
        }
  });
  if (!Number.isFinite(uMin) || uMax - uMin <= 0 || vMax - vMin <= 0)
    return null;

  return {
    u: faceU.clone(),
    v: faceV.clone(),
    origin: faceOrigin.clone(),
    uMin,
    uMax,
    vMin,
    vMax,
  };
}

function faceQuadForSubtree(
  root: THREE.Object3D,
  viewport: DOMRect,
):
  | readonly [
      ProjectedScreenPoint,
      ProjectedScreenPoint,
      ProjectedScreenPoint,
      ProjectedScreenPoint,
    ]
  | null {
  if (!projectionCamera) return null;
  const basis = artifactFaceBasis(root);
  if (!basis) return null;
  const { u: basisU, v: basisV, origin, uMin, uMax, vMin, vMax } = basis;

  const quad: ProjectedScreenPoint[] = [];
  for (const [u, v] of [
    [uMin, vMax],
    [uMax, vMax],
    [uMax, vMin],
    [uMin, vMin],
  ] as const) {
    facePosition
      .copy(origin)
      .addScaledVector(basisU, u)
      .addScaledVector(basisV, v)
      .project(projectionCamera);
    if (facePosition.z < -1 || facePosition.z > 1) return null;
    quad.push([
      viewport.left + (facePosition.x * 0.5 + 0.5) * viewport.width,
      viewport.top + (-facePosition.y * 0.5 + 0.5) * viewport.height,
    ]);
  }
  // The basis vectors carry no promise about which way they point on
  // screen. The preview maps its image's top-left onto the first corner, so
  // normalize in screen space: top edge left-to-right, left edge
  // top-to-bottom. Prints are never rendered upside down; this only
  // untangles the basis signs.
  let [tl, tr, br, bl] = quad as [
    ProjectedScreenPoint,
    ProjectedScreenPoint,
    ProjectedScreenPoint,
    ProjectedScreenPoint,
  ];
  if (tl[0] > tr[0]) [tl, tr, br, bl] = [tr, tl, bl, br];
  if (tl[1] > bl[1]) [tl, tr, br, bl] = [bl, br, tr, tl];
  return [tl, tr, br, bl] as const;
}

export function setInteractionProjectionContext(
  camera: THREE.Camera | null,
  element: HTMLElement | null,
) {
  projectionCamera = camera;
  projectionElement = element;
  setDoorProjectionResolver(camera && element ? projectDoorWithContext : null);
  setInteractionRectProjectionResolver(
    camera && element ? projectInteractionRectWithContext : null,
  );
}

export type PointerActivation = {
  id: string;
  kind: "door" | "action" | "egg" | "artifact";
};

/** Touch has no hover state. Raycast every registered prop so an
 * activation can run only when it owns the nearest visible hit. Inert and
 * movable-only props intentionally return null and occlude activations behind
 * them. */
export function activationAtPointer(
  clientX: number,
  clientY: number,
): PointerActivation | null {
  if (!projectionCamera || !projectionElement) return null;
  const rect = projectionElement.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  )
    return null;
  pointerNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  pointerRaycaster.setFromCamera(pointerNdc, projectionCamera);
  let best: {
    id: string;
    distance: number;
    activation: "door" | "action" | "egg" | "artifact" | null;
  } | null = null;
  for (const spec of sceneInteractionInventory()) {
    if (spec.touchable === false || !isEffectivelyVisible(spec.root)) continue;
    const hit = pointerRaycaster.intersectObject(spec.root, true)[0];
    if (!hit || (best && hit.distance >= best.distance)) continue;
    best = {
      id: spec.id,
      distance: hit.distance,
      activation: spec.activation?.kind ?? null,
    };
  }
  return best?.activation ? { id: best.id, kind: best.activation } : null;
}

/** Doors share the general touch raycast while still failing closed when the
 * nearest object is an action, easter egg, or inert prop. */
export function doorAtPointer(clientX: number, clientY: number) {
  const hit = activationAtPointer(clientX, clientY);
  return hit?.kind === "door" ? hit.id : null;
}
