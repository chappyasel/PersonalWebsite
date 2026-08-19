"use client";

import type * as THREE from "three";
import { Box3, Raycaster, Vector2, Vector3 } from "three";

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

function projectDoorWithContext(id: string): ProjectedDoor | null {
  const spec = getSceneInteraction(id);
  if (
    !spec ||
    (spec.activation?.kind !== "door" && spec.activation?.kind !== "action")
  )
    return null;
  if (!projectionCamera || !projectionElement || !spec.root.visible)
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
  _activeUnit: number,
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
    if (!spec.root.visible) continue;
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
  activeUnit: number,
) {
  const hit = activationAtPointer(clientX, clientY, activeUnit);
  return hit?.kind === "door" ? hit.id : null;
}
