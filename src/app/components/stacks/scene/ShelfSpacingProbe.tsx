"use client";

import { useStacks } from "../store";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { type ShelfSpan, auditShelfSpacing } from "./shelfSpacing";

export type ShelfSpacingSnapshot = Record<
  string,
  {
    top: ReturnType<typeof auditShelfSpacing>;
    lower: ReturnType<typeof auditShelfSpacing>;
  }
>;

const snapshots: ShelfSpacingSnapshot = {};

export function shelfSpacingSnapshot(): ShelfSpacingSnapshot {
  return structuredClone(snapshots);
}

function meshSpans(root: THREE.Group, box: THREE.Box3): ShelfSpan[] {
  const spans: ShelfSpan[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    const sourceMaterial = node.material as THREE.Material | THREE.Material[];
    const materials = Array.isArray(sourceMaterial)
      ? sourceMaterial
      : [sourceMaterial];
    if (
      materials.every(
        (material) => material.transparent && material.opacity < 0.22,
      )
    )
      return;
    box.setFromObject(node, true);
    if (box.isEmpty()) return;
    let left = Infinity;
    let right = -Infinity;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const point = root.worldToLocal(new THREE.Vector3(x, y, z));
          left = Math.min(left, point.x);
          right = Math.max(right, point.x);
        }
      }
    }
    spans.push({ left, right });
  });
  return spans;
}

export default function ShelfSpacingProbe({
  unitIndex,
  top,
  lower,
  halfWidth,
}: {
  unitIndex: number;
  top: React.RefObject<THREE.Group | null>;
  lower: React.RefObject<THREE.Group | null>;
  halfWidth: number;
}) {
  const frame = useRef(0);
  const box = useMemo(() => new THREE.Box3(), []);
  useFrame(() => {
    if (
      useStacks.getState().activeUnit !== unitIndex ||
      ++frame.current % 30 !== 0 ||
      !top.current ||
      !lower.current
    )
      return;
    const bounds = { left: -halfWidth, right: halfWidth };
    snapshots[`unit-${unitIndex}`] = {
      top: auditShelfSpacing(meshSpans(top.current, box), bounds),
      lower: auditShelfSpacing(meshSpans(lower.current, box), bounds),
    };
  });
  return null;
}

declare global {
  interface Window {
    __shelfSpacing?: { snapshot: typeof shelfSpacingSnapshot };
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__shelfSpacing = { snapshot: shelfSpacingSnapshot };
}
