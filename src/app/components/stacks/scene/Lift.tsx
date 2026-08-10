"use client";

// Damped hover lift — wraps a hover target and eases the wrapper group
// toward base or base+offset depending on whether `hoverKey` owns the
// store's hovered slot. The store is read imperatively inside useFrame, so
// hovering re-renders nothing (the old ternaries re-rendered the whole row
// and its Suspense subtrees); the damp snaps and idles once settled.
//
// The photographs want two channels the props never did: they are placed at
// a random tilt, and letting the hover ease a few degrees of it away — with
// a hair of scale — reads as the print turning toward you. Both are opt-in,
// so a caller that passes neither still pays for the position damp alone.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { useStacks } from "../store";

const LAMBDA = 10; // ~95% of the travel in 300ms

/** Walk one euler component `by` radians toward level, never past it. */
const toward = (v: number, by: number) =>
  v > 0 ? Math.max(0, v - by) : Math.min(0, v + by);

export default function Lift({
  hoverKey,
  base,
  offset,
  rest,
  settle = 0,
  grow = 1,
  children,
}: {
  hoverKey: string;
  base: [number, number, number];
  offset: [number, number, number];
  /** Rest tilt. It belongs to the lift rather than to a wrapping group —
   * a tilt applied outside is out of the hover's reach. */
  rest?: [number, number, number];
  /** Radians of `rest` eased away per axis while hovered. Absolute rather
   * than a fraction: a print turned hard on the shelf would swing if it
   * straightened by proportion, while a nearly-square one would not move. */
  settle?: number;
  /** Uniform scale while hovered. */
  grow?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const lifted = useStacks.getState().hovered === hoverKey;
    const tx = base[0] + (lifted ? offset[0] : 0);
    const ty = base[1] + (lifted ? offset[1] : 0);
    const tz = base[2] + (lifted ? offset[2] : 0);
    const by = lifted ? settle : 0;
    const rx = rest ? toward(rest[0], by) : 0;
    const ry = rest ? toward(rest[1], by) : 0;
    const rz = rest ? toward(rest[2], by) : 0;
    const ts = lifted ? grow : 1;
    const p = g.position;
    const r = g.rotation;
    const error =
      Math.abs(p.x - tx) +
      Math.abs(p.y - ty) +
      Math.abs(p.z - tz) +
      Math.abs(r.x - rx) +
      Math.abs(r.y - ry) +
      Math.abs(r.z - rz) +
      Math.abs(g.scale.x - ts);
    if (error < 1e-4) {
      p.set(tx, ty, tz);
      r.set(rx, ry, rz);
      g.scale.setScalar(ts);
      return;
    }
    p.x = THREE.MathUtils.damp(p.x, tx, LAMBDA, delta);
    p.y = THREE.MathUtils.damp(p.y, ty, LAMBDA, delta);
    p.z = THREE.MathUtils.damp(p.z, tz, LAMBDA, delta);
    r.x = THREE.MathUtils.damp(r.x, rx, LAMBDA, delta);
    r.y = THREE.MathUtils.damp(r.y, ry, LAMBDA, delta);
    r.z = THREE.MathUtils.damp(r.z, rz, LAMBDA, delta);
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, ts, LAMBDA, delta));
  });
  return (
    <group ref={ref} position={base} rotation={rest}>
      {children}
    </group>
  );
}
