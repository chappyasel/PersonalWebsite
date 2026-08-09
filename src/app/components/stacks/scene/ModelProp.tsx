"use client";

// GLB prop loader for the curated CC0 set (see scripts/stacks-models.mjs).
// Two variants:
// - "atlas": CreativeTrio props ship stripped of their shared 128×128
//   palette atlas; ONE themed MeshStandardMaterial per theme (map =
//   /models/atlas-{theme}.png) is shared across every atlas prop, so the
//   whole set recolors with a ~0.8KB texture swap. Never tint atlas props
//   via material.color — it tints clock faces and pages too.
// - "tinted": untextured props (Quaternius open book, the golf club) keep
//   their own materials; `tints` remaps colors by material name. Props with
//   a private texture (basketball) use "tinted" with `tintAll` to mute the
//   stock hue toward the palette.
// Every material is forced to metalness 0 / roughness ~0.7 — CreativeTrio
// ships 0.4/0.272, which reads as tinted chrome under our environment map.
import { useGLTF, useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

export const ATLAS_URLS = ["/models/atlas-light.png", "/models/atlas-dark.png"];

export const MODEL_URLS = [
  "/models/desk-lamp.glb",
  "/models/mug.glb",
  "/models/potted-plant.glb",
  "/models/alarm-clock.glb",
  "/models/headphones.glb",
  "/models/dumbbell.glb",
  "/models/globe.glb",
  "/models/trophy.glb",
  "/models/open-book.glb",
  "/models/golf-club.glb",
  "/models/basketball.glb",
];

// One shared material per themed atlas texture (drei caches the texture by
// URL, so the uuid is stable across every ModelProp instance).
const atlasMaterials = new Map<string, THREE.MeshStandardMaterial>();

function atlasMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial {
  let mat = atlasMaterials.get(tex.uuid);
  if (!mat) {
    tex.flipY = false; // glTF UV convention — drei's loader defaults to flipped
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0,
      roughness: 0.7,
    });
    atlasMaterials.set(tex.uuid, mat);
  }
  return mat;
}

export default function ModelProp({
  url,
  dark,
  variant = "atlas",
  tints,
  tintAll,
  roughness = 0.7,
  position,
  rotation,
  scale,
}: {
  url: string;
  dark: boolean;
  variant?: "atlas" | "tinted";
  /** tinted only: material name → hex color remap. */
  tints?: Record<string, string>;
  /** tinted only: multiply every material (and its texture) by this color. */
  tintAll?: string;
  roughness?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const { scene } = useGLTF(url, false);
  const atlases = useTexture(ATLAS_URLS);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    if (variant === "atlas") {
      const mat = atlasMaterial(atlases[dark ? 1 : 0]!);
      clone.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = mat;
      });
    } else {
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const src = o.material as THREE.MeshStandardMaterial;
        const mat = src.clone();
        const tint = tints?.[src.name];
        if (tint) mat.color.set(tint);
        if (tintAll) mat.color.multiply(new THREE.Color(tintAll));
        mat.metalness = 0;
        mat.roughness = roughness;
        o.material = mat;
      });
    }
    return clone;
  }, [scene, atlases, dark, variant, tints, tintAll, roughness]);
  return (
    <primitive
      object={object}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
}

/** Fire-and-forget prefetch of the full prop set (~140KB incl. atlases) —
 * called once after the world mounts so props pop in together instead of
 * trickling per-unit. */
export function preloadModels() {
  for (const url of MODEL_URLS) useGLTF.preload(url, false);
  useTexture.preload(ATLAS_URLS);
}
