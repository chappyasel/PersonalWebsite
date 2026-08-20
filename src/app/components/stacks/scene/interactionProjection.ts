"use client";

import type { ProjectedInteractionBounds } from "../mobile/halos";
import type * as THREE from "three";
import { Box3, Matrix4, Raycaster, Vector2, Vector3 } from "three";

import {
  type ProjectedDoor,
  getSceneInteraction,
  sceneInteractionInventory,
  setDoorProjectionResolver,
} from "./interactionRegistry";

let projectionCamera: THREE.Camera | null = null;
let projectionElement: HTMLElement | null = null;
const projectionBox = new Box3();
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

export function projectedInteractionBounds(
  pointer?: { x: number; y: number },
): ProjectedInteractionBounds[] {
  if (!projectionCamera || !projectionElement) return [];
  const rect = projectionElement.getBoundingClientRect();
  // `activeUnits` records which authored shelf owns an interaction. It is not
  // a visibility boundary: neighboring shelves remain on screen during
  // travel and at intermediate authored stops such as Golf. The camera and
  // the rendered hierarchy decide what touch can reach.
  const specs = sceneInteractionInventory().filter((spec) =>
    isEffectivelyVisible(spec.root),
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
  projectionBox.setFromObject(spec.root, true);
  if (
    projectionBox.isEmpty() ||
    !Number.isFinite(projectionBox.min.x) ||
    !Number.isFinite(projectionBox.max.y)
  ) {
    // An empty carrier is still the linked object. Its world origin is a much
    // better fallback than the live pointer: the tooltip stays attached while
    // the visitor moves between neighbouring links or the model streams in.
    spec.root.getWorldPosition(projectionPoint);
  } else {
    projectionPoint.set(
      (projectionBox.min.x + projectionBox.max.x) / 2,
      projectionBox.max.y,
      (projectionBox.min.z + projectionBox.max.z) / 2,
    );
  }
  projectionPoint.project(projectionCamera);
  const rect = projectionElement.getBoundingClientRect();
  return {
    x: rect.left + (projectionPoint.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-projectionPoint.y * 0.5 + 0.5) * rect.height,
    behind: projectionPoint.z < -1 || projectionPoint.z > 1,
  };
}

export function setInteractionProjectionContext(
  camera: THREE.Camera | null,
  element: HTMLElement | null,
) {
  projectionCamera = camera;
  projectionElement = element;
  setDoorProjectionResolver(camera && element ? projectDoorWithContext : null);
}

export type PointerActivation = {
  id: string;
  kind: "door" | "action" | "egg";
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
    activation: "door" | "action" | "egg" | null;
  } | null = null;
  for (const spec of sceneInteractionInventory()) {
    if (!isEffectivelyVisible(spec.root)) continue;
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
export function doorAtPointer(
  clientX: number,
  clientY: number,
) {
  const hit = activationAtPointer(clientX, clientY);
  return hit?.kind === "door" ? hit.id : null;
}
