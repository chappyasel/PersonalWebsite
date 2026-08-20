"use client";

import { type ReactNode, useEffect, useRef } from "react";
import type * as THREE from "three";

import { registerSceneInteraction } from "./interactionRegistry";

/** Gives a fixed authored prop the same first-tap Focus Lean as movable props
 * without inventing a click action or making furniture draggable. */
export default function TouchFocusTarget({
  id,
  unitIndex,
  activeUnitIndexes,
  children,
}: {
  id: string;
  unitIndex: number;
  activeUnitIndexes?: readonly number[];
  children: ReactNode;
}) {
  const root = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!root.current) return;
    return registerSceneInteraction({
      id,
      root: root.current,
      activeUnits: [...(activeUnitIndexes ?? [unitIndex])],
      hover: { kind: "none" },
    });
  }, [activeUnitIndexes, id, unitIndex]);

  return <group ref={root}>{children}</group>;
}
