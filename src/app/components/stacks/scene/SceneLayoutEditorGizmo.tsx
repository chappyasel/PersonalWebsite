"use client";

import { TransformControls } from "@react-three/drei";
import { useSyncExternalStore } from "react";

import { sceneLayoutEditorController } from "./sceneLayoutEditor";

export default function SceneLayoutEditorGizmo() {
  const snapshot = useSyncExternalStore(
    sceneLayoutEditorController.subscribe,
    sceneLayoutEditorController.getSnapshot,
    sceneLayoutEditorController.getSnapshot,
  );
  const root = sceneLayoutEditorController.selectedRoot();
  if (!snapshot.enabled || !snapshot.selectedId || !root) return null;

  const update = () => {
    const position = [
      root.position.x,
      root.position.y,
      root.position.z,
    ] as const;
    const rotation = [
      root.rotation.x,
      root.rotation.y,
      root.rotation.z,
    ] as const;
    sceneLayoutEditorController.update(snapshot.selectedId!, [
      position[0],
      position[1],
      position[2],
    ]);
    sceneLayoutEditorController.updateRotation(snapshot.selectedId!, [
      rotation[0],
      rotation[1],
      rotation[2],
    ]);
  };

  return (
    <TransformControls
      object={root}
      mode={snapshot.mode}
      space="local"
      size={0.72}
      onMouseDown={() => sceneLayoutEditorController.setGestureActive(true)}
      onMouseUp={() => sceneLayoutEditorController.setGestureActive(false)}
      onObjectChange={update}
    />
  );
}
