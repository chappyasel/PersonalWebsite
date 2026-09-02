"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { VISION_PRO_MODEL_URL, VISION_PRO_POSE } from "./visionProGeometry";

type VisionProMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.Material | THREE.Material[]
>;

/** One-line trial switch for the owner-authored front-display comparison. */
export const VISION_PRO_DISPLAY_ENABLED = false;
const VISION_PRO_DISPLAY_TEXTURE_WIDTH = 128;
const VISION_PRO_DISPLAY_TEXTURE_HEIGHT = 64;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

/** Sample the soft two-lobed display shown beneath Apple's smoked visor.
 * Coordinates use the texture convention: (0, 0) is the lower-left corner. */
export function visionProDisplayPixel(
  u: number,
  v: number,
): readonly [number, number, number, number] {
  const leftEllipse =
    ((u - 0.34) / 0.31) ** 2 + ((v - 0.53) / 0.39) ** 2;
  const rightEllipse =
    ((u - 0.66) / 0.31) ** 2 + ((v - 0.53) / 0.39) ** 2;
  const lobeDistance = Math.min(leftEllipse, rightEllipse);
  const outerCoverage = 1 - smoothstep(0.9, 1, lobeDistance);
  const noseBoundary =
    0.12 + 0.34 * Math.exp(-Math.pow((u - 0.5) / 0.105, 2));
  const noseCoverage = smoothstep(noseBoundary, noseBoundary + 0.035, v);
  const alpha = clamp01(outerCoverage * noseCoverage);

  const blend = smoothstep(0.1, 0.9, u);
  const left = [238, 68, 132] as const;
  const right = [82, 72, 222] as const;
  const centerGlow = Math.exp(-Math.pow((u - 0.48) / 0.23, 2)) * 18;
  const verticalGlow = 0.82 + 0.18 * Math.sin(clamp01(v) * Math.PI);
  const color = (from: number, to: number) =>
    Math.round(
      clamp01(((from + (to - from) * blend + centerGlow) * verticalGlow) / 255) *
        255,
    );

  return [
    color(left[0], right[0]),
    color(left[1], right[1]),
    color(left[2], right[2]),
    Math.round(alpha * 255),
  ];
}

export function createVisionProDisplayTexture() {
  const data = new Uint8Array(
    VISION_PRO_DISPLAY_TEXTURE_WIDTH * VISION_PRO_DISPLAY_TEXTURE_HEIGHT * 4,
  );
  for (let y = 0; y < VISION_PRO_DISPLAY_TEXTURE_HEIGHT; y += 1) {
    for (let x = 0; x < VISION_PRO_DISPLAY_TEXTURE_WIDTH; x += 1) {
      const pixel = visionProDisplayPixel(
        x / (VISION_PRO_DISPLAY_TEXTURE_WIDTH - 1),
        y / (VISION_PRO_DISPLAY_TEXTURE_HEIGHT - 1),
      );
      data.set(pixel, (y * VISION_PRO_DISPLAY_TEXTURE_WIDTH + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(
    data,
    VISION_PRO_DISPLAY_TEXTURE_WIDTH,
    VISION_PRO_DISPLAY_TEXTURE_HEIGHT,
    THREE.RGBAFormat,
  );
  texture.name = "vision-pro-display-gradient";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/** The source display primitive has no TEXCOORD_0 attribute because its
 * original material was uniform. Project its local front plane into UV space
 * so the shaped display texture does not sample one transparent corner. */
export function createVisionProDisplayGeometry(
  source: THREE.BufferGeometry,
) {
  const geometry = source.clone();
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds || !position) return geometry;
  const width = Math.max(Number.EPSILON, bounds.max.x - bounds.min.x);
  const height = Math.max(Number.EPSILON, bounds.max.y - bounds.min.y);
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (position.getX(index) - bounds.min.x) / width;
    uv[index * 2 + 1] = (position.getY(index) - bounds.min.y) / height;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

type VisionProMaterialOptions = Readonly<{
  dark: boolean;
  displayEnabled?: boolean;
  displayTexture?: THREE.Texture | null;
}>;

export function tuneVisionProMaterial(
  material: THREE.Material,
  {
    dark,
    displayEnabled = VISION_PRO_DISPLAY_ENABLED,
    displayTexture = null,
  }: VisionProMaterialOptions,
) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;

  material.envMapIntensity = dark ? 1.7 : 2;

  if (material.name === "Front Glass") {
    material.color.set(dark ? "#071019" : "#0b1720");
    material.metalness = 0.66;
    material.roughness = 0.055;
    material.envMapIntensity = 3.25;
  }

  // The source's display plane is a flat rectangle beneath the curved visor.
  // Keep its trial state explicit so the owner can compare an illuminated
  // EyeSight-like layer against the clean reflective-glass presentation.
  if (material.name === "1708700653640") {
    material.visible = displayEnabled;
    if (!displayEnabled) return;
    material.color.set("#7b6874");
    material.emissive.set("#ffffff");
    material.emissiveIntensity = dark ? 0.88 : 0.74;
    material.opacity = 0.86;
    material.transparent = true;
    material.depthWrite = false;
    material.alphaTest = 0.01;
    material.map = displayTexture;
    material.emissiveMap = displayTexture;
    material.needsUpdate = true;
  }
}

/** The owner-supplied Blender model, reduced from 300k+ to 19k triangles for
 * the web while retaining its glass, aluminum, cameras, light seal, and knit
 * band as separate material surfaces. The loose battery and cable are
 * intentionally excluded from the shelf export. */
export function VisionProProp({ dark }: { dark: boolean }) {
  const { scene } = useGLTF(VISION_PRO_MODEL_URL, false);
  const displayTexture = useMemo(() => createVisionProDisplayTexture(), []);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as VisionProMesh;
      mesh.castShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      if (materials.some((material) => material.name === "1708700653640")) {
        mesh.geometry = createVisionProDisplayGeometry(mesh.geometry);
        mesh.userData.ownsVisionProDisplayGeometry = true;
      }
      for (const material of materials) {
        tuneVisionProMaterial(material, { dark, displayTexture });
      }
    });
    return clone;
  }, [dark, displayTexture, scene]);

  useEffect(
    () => () => {
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const mesh = object as VisionProMesh;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) material.dispose();
        if (mesh.userData.ownsVisionProDisplayGeometry) mesh.geometry.dispose();
      });
    },
    [model],
  );
  useEffect(() => () => displayTexture.dispose(), [displayTexture]);

  return (
    <primitive
      object={model}
      position={[0, VISION_PRO_POSE.seat, 0]}
      rotation={[...VISION_PRO_POSE.rotation]}
      scale={VISION_PRO_POSE.scale}
      dispose={null}
    />
  );
}
