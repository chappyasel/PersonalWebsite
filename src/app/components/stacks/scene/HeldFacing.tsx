"use client";

import { useStacks } from "../store";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";

import { useUnitFrame } from "./unitActivity";

type EulerTuple = [number, number, number];

/**
 * Keeps authored shelf pose at rest, then turns a carried surface square to
 * the live camera. This sits inside Grabbable so it cancels the carrier's
 * small velocity tilt as well as each photo/book's authored yaw and roll.
 */
export default function HeldFacing({
  hoverKey,
  rest = [0, 0, 0],
  facingRotation = [0, 0, 0],
  position,
  scale,
  name,
  children,
}: {
  hoverKey: string;
  /** Local shelf pose. */
  rest?: EulerTuple;
  /** Rotation that points the content's meaningful front along local +Z. */
  facingRotation?: EulerTuple;
  position?: EulerTuple;
  scale?: number | EulerTuple;
  name?: string;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const [restX, restY, restZ] = rest;
  const [facingX, facingY, facingZ] = facingRotation;
  const still = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const restQuaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(restX, restY, restZ),
      ),
    [restX, restY, restZ],
  );
  const facingQuaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(facingX, facingY, facingZ),
      ),
    [facingX, facingY, facingZ],
  );
  const parentWorld = useMemo(() => new THREE.Quaternion(), []);
  const cameraWorld = useMemo(() => new THREE.Quaternion(), []);
  const target = useMemo(() => new THREE.Quaternion(), []);

  useUnitFrame(({ camera }, rawDelta) => {
    const node = group.current;
    if (!node) return;
    const carried = useStacks.getState().dragging === hoverKey;
    if (carried && node.parent) {
      node.parent.getWorldQuaternion(parentWorld).invert();
      camera.getWorldQuaternion(cameraWorld);
      target.copy(parentWorld).multiply(cameraWorld).multiply(facingQuaternion);
    } else {
      target.copy(restQuaternion);
    }

    if (still) node.quaternion.copy(target);
    else
      node.quaternion.slerp(
        target,
        1 - Math.exp(-10 * Math.min(rawDelta, 1 / 30)),
      );
    if (!carried && node.quaternion.angleTo(restQuaternion) < 1e-4)
      node.quaternion.copy(restQuaternion);
  });

  return (
    <group
      ref={group}
      name={name ?? `held-facing:${hoverKey}`}
      position={position}
      rotation={[restX, restY, restZ]}
      scale={scale}
    >
      {children}
    </group>
  );
}
