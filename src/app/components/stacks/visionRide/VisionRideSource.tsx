"use client";

import { useStacks } from "../store";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";

import { visionRideRuntime } from "./visionRideRuntime";

export default function VisionRideSource({
  children,
}: {
  children: React.ReactNode;
}) {
  const root = useRef<THREE.Group>(null);
  const phase = useStacks((state) => state.visionRidePhase);

  useEffect(() => {
    if (!root.current) return;
    return visionRideRuntime.registerSource(root.current);
  }, []);

  useFrame(() => {
    if (phase === "idle" || phase === "returning")
      visionRideRuntime.updateReturnAnchor();
  });

  return (
    <group ref={root} visible={phase === "idle"}>
      {children}
    </group>
  );
}
