"use client";

// One frozen chicken bag for the Systems shelf: Kenney's standing bag
// (public/models/bag.glb, CC0) wearing an owner-drawn label. The GLB's
// palette UVs are replaced at load by a chart over the printed face
// (./bagLabelUvs); the label itself is baked from
// scripts/stacks-labels/realgood.svg by scripts/stacks-labels.mjs. Nothing
// here is a photograph: flat colour and word-shapes, recognisable to anyone
// who buys the bag and a nice bag of frozen something to anyone else. The
// unit places three of these, each its own Grabbable.
import { useGLTF, useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { projectStandingBagUvs } from "./bagLabelUvs";

export const BAG_MODEL_URL = "/models/bag.glb";
export const BAG_LABEL_URL = "/images/stacks/labels/realgood.webp";

// The GLB rides the shared MODEL_URLS warm batch; the label is this file's
// own asset, so it warms here the way the golf flag's logo does. Without it
// the bags suspend on a small webp and pop in after the shelf has settled.
useTexture.preload(BAG_LABEL_URL);

/** The model's printed face is +x; this yaw turns it to the viewer (+z). */
export const BAG_FACE_YAW = -Math.PI / 2;

/** Bottom-at-origin like every pipeline prop (the GLB root carries the
 * centring translation, so the mesh's world matrix is baked in here rather
 * than trusting vertex data). */
function bakedGeometry(scene: THREE.Group): THREE.BufferGeometry | null {
  scene.updateMatrixWorld(true);
  let found: THREE.BufferGeometry | null = null;
  scene.traverse((o) => {
    if (found) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    found = geo;
  });
  return found;
}

/** The label file's pouch white is paper white (#f8f6f1). Printed as-is the
 * bags read a stop brighter than everything around them, because the prints
 * and covers are all warm-graded (LitImage multiplies toward the lamp) and
 * these were not. Multiplying the material by this off-white brings them
 * into the same light: ~10% darker, a touch warm, the orange barely moved. */
const BAG_TINT = "#e6dfd2";

export default function FrozenBag({
  scale = 1,
  yaw = 0,
  roughness = 0.78,
}: {
  scale?: number;
  /** Extra yaw on top of the face-to-viewer turn, for fanning a row. */
  yaw?: number;
  /** Frozen-pouch plastic: matte enough that the lamp does not put a
   * highlight on a bag standing in the plank's shadow. */
  roughness?: number;
}) {
  const { scene } = useGLTF(BAG_MODEL_URL, false);
  const label = useTexture(BAG_LABEL_URL, (tex) => {
    // Runs once per cached URL. A colour texture must be sRGB or the orange
    // band prints as a washed peach after tone mapping.
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  });
  const geometry = useMemo(() => {
    const baked = bakedGeometry(scene);
    if (!baked) return null;
    const { geometry } = projectStandingBagUvs(baked);
    baked.dispose();
    return geometry;
  }, [scene]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh
      geometry={geometry}
      scale={scale}
      rotation={[0, BAG_FACE_YAW + yaw, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        map={label}
        color={BAG_TINT}
        roughness={roughness}
        metalness={0}
      />
    </mesh>
  );
}
