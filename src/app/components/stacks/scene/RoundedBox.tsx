"use client";

import { type ThreeElements } from "@react-three/fiber";
import { forwardRef, useMemo } from "react";
import type { Mesh } from "three";

import { ROUNDED_BOX_DEFAULTS, roundedBoxGeometry } from "./roundedBoxGeometry";

/**
 * Drop-in replacement for drei's `RoundedBox` that shares geometry.
 *
 * Same props, same silhouette — the shape and extrude parameters are copied
 * from drei rather than reinterpreted. The only difference is that identical
 * boxes reuse one geometry instead of each building an `ExtrudeGeometry` and
 * then running a creased-normals pass over it.
 *
 * That pass allocates a string key per vertex, and it measured as the largest
 * single cost in a mobile cold boot: 12 percent of main-thread samples in a
 * CPU profile of the production build at 6x throttle. The room has 35 call
 * sites and only a handful of distinct sizes among them.
 *
 * Swapping a call site is an import change. Geometry is shared and outlives
 * the mesh, so nothing here disposes it.
 */
export type RoundedBoxProps = Omit<ThreeElements["mesh"], "args" | "ref"> & {
  /** `[width, height, depth]`, as drei takes it. */
  args?: [number, number, number];
  radius?: number;
  steps?: number;
  smoothness?: number;
  bevelSegments?: number;
  creaseAngle?: number;
};

export const RoundedBox = forwardRef<Mesh, RoundedBoxProps>(function RoundedBox(
  {
    args: [width = 1, height = 1, depth = 1] = [1, 1, 1],
    radius = ROUNDED_BOX_DEFAULTS.radius,
    steps = ROUNDED_BOX_DEFAULTS.steps,
    smoothness = ROUNDED_BOX_DEFAULTS.smoothness,
    bevelSegments = ROUNDED_BOX_DEFAULTS.bevelSegments,
    creaseAngle = ROUNDED_BOX_DEFAULTS.creaseAngle,
    children,
    ...rest
  },
  ref,
) {
  const geometry = useMemo(
    () =>
      roundedBoxGeometry({
        width,
        height,
        depth,
        radius,
        steps,
        smoothness,
        bevelSegments,
        creaseAngle,
      }),
    [
      width,
      height,
      depth,
      radius,
      steps,
      smoothness,
      bevelSegments,
      creaseAngle,
    ],
  );
  return (
    // `dispose={null}` because the geometry is shared. r3f disposes what it
    // owns when a mesh unmounts, and one book leaving the shelf must not
    // take the geometry out from under every other box the same size. The
    // cache owns these for the module's lifetime instead.
    <mesh ref={ref} geometry={geometry} dispose={null} {...rest}>
      {children}
    </mesh>
  );
});
