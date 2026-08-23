"use client";

// A MiO water-enhancer bottle for the Systems shelf. No GLB: the bottle is an
// egg on a lathe (./mioBottleGeometry) and its whole skin is one owner-drawn
// label baked from scripts/stacks-labels/mio-<flavor>.svg, cap colour
// included, so the geometry needs no materials of its own. Two flavours, two
// real sizes; the unit stands a handful of them in front of the chicken bags,
// each its own Grabbable.
import { useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { MIO_SIZES, mioBottleGeometry } from "./mioBottleGeometry";

export type MioFlavor = keyof typeof MIO_SIZES;

export const MIO_LABEL_URLS: Record<MioFlavor, string> = {
  hydrate: "/images/stacks/labels/mio-hydrate.webp",
  lemonade: "/images/stacks/labels/mio-lemonade.webp",
};

// Warm both skins with the scene, like the bag label and the golf flag logo;
// a bottle that suspends on a small webp pops in after the shelf settles.
for (const url of Object.values(MIO_LABEL_URLS)) useTexture.preload(url);

/** The lathe's seam (u = 0) starts at +z, so a half turn puts u = 0.5 — the
 * label's front — toward the viewer, with u increasing to the viewer's
 * right. */
const SEAM_TO_BACK = Math.PI;

/** Same idea as the bags: the label files print saturated, and everything
 * else on the shelf is warm-graded, so multiply toward the room's off-white
 * (lighter than the bags' because these colours are meant to sing a little). */
const MIO_TINT = "#ede6da";

/** One geometry per size, shared by every bottle of that flavour. */
const geometryCache = new Map<MioFlavor, THREE.BufferGeometry>();
function sharedGeometry(flavor: MioFlavor) {
  let geo = geometryCache.get(flavor);
  if (!geo) {
    geo = mioBottleGeometry(MIO_SIZES[flavor]);
    geometryCache.set(flavor, geo);
  }
  return geo;
}

export default function MioBottle({
  flavor,
  yaw = 0,
  roughness = 0.38,
}: {
  flavor: MioFlavor;
  /** Turn on top of the seam-to-back half turn, for a loose row. */
  yaw?: number;
  /** Squeeze-bottle plastic: glossier than the bags, short of wet. */
  roughness?: number;
}) {
  const label = useTexture(MIO_LABEL_URLS[flavor], (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  });
  const geometry = useMemo(() => sharedGeometry(flavor), [flavor]);
  // Shared across instances: never dispose here. (Module lifetime, like the
  // couch fabric maps in ModelProp.)
  useEffect(() => undefined, [geometry]);
  return (
    <mesh
      geometry={geometry}
      rotation={[0, SEAM_TO_BACK + yaw, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        map={label}
        color={MIO_TINT}
        roughness={roughness}
        metalness={0}
      />
    </mesh>
  );
}
