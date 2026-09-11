"use client";
import { useRoomActive } from "../room/ResidentRoomHost";

import { useStacks } from "../store";
import type { VisionRidePhase } from "../visionRide/visionRideState";
import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  type ActiveVisionProDisplayVariant,
  type VisionProDisplayVariant,
  createVisionProDisplayTexture,
} from "./visionProDisplay";
import { useVisionProDisplaySnapshot } from "./visionProDisplayDiagnostics";
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
  displayBrightness?: number;
}>;

const VISION_PRO_INTERACTION_ID = "action:about:vision-ride";
const VISION_PRO_HOVER_BRIGHTNESS = 0.3;

type VisionProDisplayInteractionState = Readonly<{
  hovered: string | null;
  focusedInteraction: string | null;
  pressedInteraction: string | null;
  visionRidePhase: VisionRidePhase;
}>;

export function visionProDisplayPreviewRequested(
  state: VisionProDisplayInteractionState,
) {
  return (
    state.visionRidePhase === "donning" ||
    state.hovered === VISION_PRO_INTERACTION_ID ||
    state.focusedInteraction === VISION_PRO_INTERACTION_ID ||
    state.pressedInteraction === VISION_PRO_INTERACTION_ID
  );
}

export function visionProDisplayWakeBrightness(
  enabled: boolean,
  engaged: boolean,
) {
  return enabled ? 1 : engaged ? VISION_PRO_HOVER_BRIGHTNESS : 0;
}

function applyVisionProDisplayBrightness(
  material: THREE.MeshStandardMaterial,
  dark: boolean,
  brightness: number,
) {
  material.visible = brightness > 0.001;
  material.emissiveIntensity = (dark ? 0.82 : 0.7) * brightness;
  material.opacity = 0.8 * brightness;
}

export function tuneVisionProMaterial(
  material: THREE.Material,
  {
    dark,
    displayVariant = "dormant",
    displayTexture = null,
    displayBrightness = 1,
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
    material.transparent = true;
    material.depthWrite = false;
    material.alphaTest = 0;
    material.map = displayTexture;
    material.emissiveMap = displayTexture;
    applyVisionProDisplayBrightness(material, dark, displayBrightness);
    material.needsUpdate = true;
  }
}

/** The owner-supplied Blender model, reduced from 300k+ to 19k triangles for
 * the web while retaining its glass, aluminum, cameras, light seal, and knit
 * band as separate material surfaces. The loose battery and cable are
 * intentionally excluded from the shelf export. */
export function VisionProProp({ dark }: { dark: boolean }) {
  const roomActive = useRoomActive();
  const { scene } = useGLTF(VISION_PRO_MODEL_URL, false);
  const displaySnapshot = useVisionProDisplaySnapshot();
  const previewRequested = useStacks(visionProDisplayPreviewRequested);
  const targetBrightness = visionProDisplayWakeBrightness(
    displaySnapshot.enabled,
    previewRequested,
  );
  const brightnessRef = useRef(displaySnapshot.enabled ? 1 : 0);
  const [renderedVariant, setRenderedVariant] =
    useState<ActiveVisionProDisplayVariant | null>(() =>
      displaySnapshot.enabled ? displaySnapshot.variant : null,
    );

  useEffect(() => {
    if (targetBrightness > 0) setRenderedVariant(displaySnapshot.variant);
  }, [displaySnapshot.variant, targetBrightness]);

  const displayTexture = useMemo(
    () =>
      renderedVariant === null
        ? null
        : createVisionProDisplayTexture(renderedVariant),
    [renderedVariant],
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
      if (materials.some((material) => material.name === "1708700653640")) {
        mesh.geometry = createVisionProDisplayGeometry(mesh.geometry);
        mesh.userData.ownsVisionProDisplayGeometry = true;
      }
    });
    return clone;
  }, [scene]);

  // Keep the primitive and all of its raycast meshes mounted. The first
  // display wake used to rebuild this clone after creating its texture, which
  // removed the hovered mesh and made the headset flicker out and back in.
  useLayoutEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as VisionProMesh;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        tuneVisionProMaterial(material, {
          dark,
          displayTexture,
          displayVariant: renderedVariant ?? "dormant",
          displayBrightness: brightnessRef.current,
        });
      }
    });
  }, [dark, displayTexture, model, renderedVariant]);

  useEffect(() => {
    if (!displayTexture || !roomActive) return;
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of meshMaterials) {
        if (
          material instanceof THREE.MeshStandardMaterial &&
          material.name === "1708700653640"
        )
          materials.push(material);
      }
    });

    const start = brightnessRef.current;
    const delta = targetBrightness - start;
    if (Math.abs(delta) < 0.001) {
      if (targetBrightness === 0) setRenderedVariant(null);
      return;
    }
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = reducedMotion ? 120 : delta > 0 ? 350 : 500;
    let frame = 0;
    let startedAt = 0;
    const animate = (now: number) => {
      if (startedAt === 0) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      const brightness = start + delta * eased;
      brightnessRef.current = brightness;
      for (const material of materials)
        applyVisionProDisplayBrightness(material, dark, brightness);
      if (progress < 1) frame = requestAnimationFrame(animate);
      else if (targetBrightness === 0) setRenderedVariant(null);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [dark, displayTexture, model, targetBrightness, roomActive]);

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
