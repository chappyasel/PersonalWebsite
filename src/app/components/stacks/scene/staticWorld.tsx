"use client";

import { useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useRef } from "react";
import type * as THREE from "three";

import { markSceneFrameInstrumented } from "./sceneFrameCost";

type LocalTransform = Readonly<{
  position: readonly [number, number, number];
  quaternion: readonly [number, number, number, number];
  scale: readonly [number, number, number];
}>;

type FrozenObject = Readonly<{
  object: THREE.Object3D;
  matrixAutoUpdate: boolean;
  matrixWorldAutoUpdate: boolean;
  transform: LocalTransform;
}>;

type FrozenRoot = Readonly<{
  id: string;
  root: THREE.Object3D;
  objects: readonly FrozenObject[];
}>;

const frozenRoots = new Map<THREE.Object3D, FrozenRoot>();

const localTransform = (object: THREE.Object3D): LocalTransform => ({
  position: [object.position.x, object.position.y, object.position.z],
  quaternion: [
    object.quaternion.x,
    object.quaternion.y,
    object.quaternion.z,
    object.quaternion.w,
  ],
  scale: [object.scale.x, object.scale.y, object.scale.z],
});

const sameValues = (left: readonly number[], right: readonly number[]) =>
  left.every((value, index) => Object.is(value, right[index]));

/** Freeze one deliberately selected, transform-static subtree. Geometry,
 * material uniforms, visibility, and instance buffers may still change. */
export function freezeStaticWorldRoot(root: THREE.Object3D, id: string) {
  // Compose the complete subtree before disabling either automatic path.
  root.traverse((object) => object.updateMatrix());
  root.updateWorldMatrix(true, true);

  const objects: FrozenObject[] = [];
  root.traverse((object) => {
    objects.push({
      object,
      matrixAutoUpdate: object.matrixAutoUpdate,
      matrixWorldAutoUpdate: object.matrixWorldAutoUpdate,
      transform: localTransform(object),
    });
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
    object.matrixWorldNeedsUpdate = false;
  });

  frozenRoots.set(root, { id, root, objects });
  return () => {
    const entry = frozenRoots.get(root);
    if (entry?.objects !== objects) return;
    frozenRoots.delete(root);
    for (const frozen of objects) {
      frozen.object.matrixAutoUpdate = frozen.matrixAutoUpdate;
      frozen.object.matrixWorldAutoUpdate = frozen.matrixWorldAutoUpdate;
      frozen.object.matrixWorldNeedsUpdate = true;
    }
  };
}

export type StaticWorldMutation = Readonly<{
  rootId: string;
  object: THREE.Object3D;
}>;

/** Development assertion seam. It compares the authored transform fields,
 * not `matrix`, because a frozen object no longer composes field mutations. */
export function findFrozenStaticWorldMutation(): StaticWorldMutation | null {
  for (const entry of frozenRoots.values()) {
    for (const frozen of entry.objects) {
      const current = localTransform(frozen.object);
      if (
        !sameValues(current.position, frozen.transform.position) ||
        !sameValues(current.quaternion, frozen.transform.quaternion) ||
        !sameValues(current.scale, frozen.transform.scale)
      )
        return { rootId: entry.id, object: frozen.object };
    }
  }
  return null;
}

/** Explicit manual update for the small number of moving objects that opt out
 * of Three's automatic matrix work, such as the camera-riding sky dome. */
export function updateManualWorldMatrix(object: THREE.Object3D) {
  object.updateMatrix();
  if (object.parent)
    object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
  else object.matrixWorld.copy(object.matrix);
  object.matrixWorldNeedsUpdate = false;
}

export function StaticWorldRoot({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const root = useRef<THREE.Group>(null);
  // Run after every committed child update. This catches a child inserted by
  // a quality or theme transition without turning the ordinary frame into a
  // subtree scan.
  useEffect(() => {
    if (!root.current) return;
    return freezeStaticWorldRoot(root.current, id);
  });
  return <group ref={root}>{children}</group>;
}

/** Opt-in diagnostics check. Ordinary development visits pay no sweep; when
 * diagnostics are active, a frozen transform mutation fails on the next
 * one-second check instead of becoming a subtle visual bug. */
export function StaticWorldInvariantProbe() {
  const nextCheckAt = useRef(0);
  useFrame(({ clock }) => {
    if (process.env.NODE_ENV !== "development") return;
    if (clock.elapsedTime < nextCheckAt.current) return;
    nextCheckAt.current = clock.elapsedTime + 1;
    markSceneFrameInstrumented();
    const mutation = findFrozenStaticWorldMutation();
    if (!mutation) return;
    const label = mutation.object.name || mutation.object.type;
    throw new Error(
      `Static world root "${mutation.rootId}" moved at "${label}". Remove it from the static allowlist or update its world matrix explicitly.`,
    );
  });
  return null;
}
