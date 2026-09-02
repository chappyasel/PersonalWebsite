"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import {
  type VisionProDisplayVariant,
  createVisionProDisplayTexture,
} from "./visionProDisplay";
import { useVisionProDisplayVariant } from "./visionProDisplayDiagnostics";
import { VISION_PRO_MODEL_URL, VISION_PRO_POSE } from "./visionProGeometry";

export {
  createVisionProDisplayTexture,
  visionProDisplayPixel,
} from "./visionProDisplay";
export type {
  ActiveVisionProDisplayVariant,
  VisionProDisplayVariant,
} from "./visionProDisplay";

type VisionProMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.Material | THREE.Material[]
>;

/** The source display primitive has no TEXCOORD_0 attribute because its
 * original material was uniform. Project its local front plane into UV space
 * so the shaped display texture does not sample one transparent corner. */
export function createVisionProDisplayGeometry(source: THREE.BufferGeometry) {
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
  displayVariant?: VisionProDisplayVariant;
  displayTexture?: THREE.Texture | null;
}>;

export function tuneVisionProMaterial(
  material: THREE.Material,
  {
    dark,
    displayVariant = "dormant",
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
  // Keep its trial state explicit so the owner can compare the ride preview
  // against the clean reflective-glass presentation.
  if (material.name === "1708700653640") {
    const displayEnabled =
      displayVariant !== "dormant" && displayTexture !== null;
    material.visible = displayEnabled;
    if (!displayEnabled) {
      material.map = null;
      material.emissiveMap = null;
      material.needsUpdate = true;
      return;
    }
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
  const displayVariant = useVisionProDisplayVariant();
  const displayTexture = useMemo(
    () =>
      displayVariant === "dormant"
        ? null
        : createVisionProDisplayTexture(displayVariant),
    [displayVariant],
  );
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
      if (
        displayTexture &&
        materials.some((material) => material.name === "1708700653640")
      ) {
        mesh.geometry = createVisionProDisplayGeometry(mesh.geometry);
        mesh.userData.ownsVisionProDisplayGeometry = true;
      }
      for (const material of materials) {
        tuneVisionProMaterial(material, {
          dark,
          displayTexture,
          displayVariant,
        });
      }
    });
    return clone;
  }, [dark, displayTexture, displayVariant, scene]);

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
  useEffect(
    () => () => {
      displayTexture?.dispose();
    },
    [displayTexture],
  );

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
