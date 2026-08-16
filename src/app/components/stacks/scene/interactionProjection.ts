"use client";

import type * as THREE from "three";
import { Box3, Raycaster, Vector2, Vector3 } from "three";

import {
  getSceneInteraction,
  sceneInteractionInventory,
  setDoorProjectionResolver,
  type ProjectedDoor,
} from "./interactionRegistry";

let projectionCamera: THREE.Camera | null = null;
let projectionElement: HTMLElement | null = null;
const projectionBox = new Box3();
const projectionPoint = new Vector3();
const pointerRaycaster = new Raycaster();
const pointerNdc = new Vector2();

function projectDoorWithContext(id: string): ProjectedDoor | null {
  const spec = getSceneInteraction(id);
  if (!spec || spec.activation?.kind !== "door") return null;
  if (!projectionCamera || !projectionElement || !spec.root.visible)
    return null;
  projectionBox.setFromObject(spec.root, true);
  if (projectionBox.isEmpty()) return null;
  projectionPoint.set(
    (projectionBox.min.x + projectionBox.max.x) / 2,
    projectionBox.max.y,
    (projectionBox.min.z + projectionBox.max.z) / 2,
  );
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
  setDoorProjectionResolver(
    camera && element ? projectDoorWithContext : null,
  );
}

/** Touch has no hover state. Raycast every active registered prop so a Door
 * can activate only when it owns the nearest visible hit; movable-only props
 * and eggs therefore occlude Doors behind them. */
export function doorAtPointer(
  clientX: number,
  clientY: number,
  activeUnit: number,
) {
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
  let best:
    | { id: string; distance: number; activation: "door" | "egg" | null }
    | null = null;
  for (const spec of sceneInteractionInventory()) {
    if (!spec.activeUnits.includes(activeUnit) || !spec.root.visible) continue;
    const hit = pointerRaycaster.intersectObject(spec.root, true)[0];
    if (!hit || (best && hit.distance >= best.distance)) continue;
    best = {
      id: spec.id,
      distance: hit.distance,
      activation: spec.activation?.kind ?? null,
    };
  }
  return best?.activation === "door" ? best.id : null;
}
