"use client";

// Damped hover lift — wraps a hover target and eases the wrapper group
// toward base or base+offset depending on whether `hoverKey` owns the
// store's hovered slot. The store is read imperatively inside useFrame, so
// hovering re-renders nothing (the old ternaries re-rendered the whole row
// and its Suspense subtrees); the damp snaps and idles once settled.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { useStacks } from "../store";

const LAMBDA = 10; // ~95% of the travel in 300ms

export default function Lift({
  hoverKey,
  base,
  offset,
  children,
}: {
  hoverKey: string;
  base: [number, number, number];
  offset: [number, number, number];
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
    const p = g.position;
    if (Math.abs(p.x - tx) + Math.abs(p.y - ty) + Math.abs(p.z - tz) < 1e-4) {
      p.set(tx, ty, tz);
      return;
    }
    p.x = THREE.MathUtils.damp(p.x, tx, LAMBDA, delta);
    p.y = THREE.MathUtils.damp(p.y, ty, LAMBDA, delta);
    p.z = THREE.MathUtils.damp(p.z, tz, LAMBDA, delta);
  });
  return (
    <group ref={ref} position={base}>
      {children}
    </group>
  );
}
